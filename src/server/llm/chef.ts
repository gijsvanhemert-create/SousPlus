import { prisma } from "@/server/db";
import { recipeCost } from "@/lib/cost";
import type { CostMode } from "@/lib/cost";
import { getRouter } from "./router";
import { llmConfig } from "./config";
import { TOOL_SCHEMAS, TOOL_BY_NAME, type ChefAction, type ToolContext } from "./tools";
import { runToolLoop, type Validation } from "./loop";
import type { LlmMessage } from "./types";

// Chef Auguste: bouwt de live APP-CONTEXT, draait de tool-loop via de router en
// bewaart de conversatie in de database zodat ze behouden blijft bij navigeren en
// herladen (verbeterpunt t.o.v. het prototype: state buiten de component).

// --- APP-CONTEXT -------------------------------------------------------------

async function buildContext(locationId: string) {
  const [recipes, catalogCount, checkpoints] = await Promise.all([
    prisma.recipe.findMany({
      where: { locationId },
      include: { activeVersion: { include: { ingredients: true } } },
      orderBy: [{ favorite: "desc" }, { dish: "asc" }],
    }),
    prisma.catalogItem.count({ where: { locationId } }),
    prisma.haccpCheckpoint.findMany({
      where: { locationId, active: true },
      select: { zone: true, target: true },
    }),
  ]);

  const menu = recipes.map((r) => {
    const v = r.activeVersion;
    const cost = v
      ? recipeCost({
          menuPrice: r.menuPrice.toString(),
          ingredients: v.ingredients.map((i) => ({
            amount: i.amount.toString(),
            mode: i.mode as CostMode,
            pricePerUnit: i.pricePerUnit.toString(),
          })),
        })
      : null;
    return {
      dish: r.dish,
      category: r.category,
      menuPrice: Number(r.menuPrice),
      popularity: r.popularity,
      marginPct: cost ? Number(cost.marginPct.toFixed(1)) : null,
      foodcostPerCover: cost ? Number(cost.foodcostPerCover.toFixed(2)) : null,
      activeVersion: v ? { label: v.label, name: v.name } : null,
      ingredients:
        v?.ingredients.map((i) => ({ name: i.name, perCover: `${i.amount}${i.unit}`, pricePerUnit: Number(i.pricePerUnit) })) ?? [],
    };
  });

  return {
    location: locationId,
    catalogSize: catalogCount,
    haccp: checkpoints,
    menu,
  };
}

function buildSystem(context: unknown): string {
  return (
    "Je bent Chef Auguste, de digitale sous-chef de cuisine binnen SousPlus+, een premium platform voor professionele keukens. " +
    "Je spreekt Nederlands. Je bent GEEN chatbot: je spreekt als een doorgewinterde brigade-souschef op Michelin-niveau — beslist, precies, warm maar met gezag, met natuurlijk gebruik van culinair-Franse vaktermen. " +
    "Houd je proza kort, als een mondelinge briefing aan de pas (meestal 2 tot 5 zinnen; alleen langer bij een echte analyse). Geen bullets tenzij echt nodig. " +
    "Baseer alles op de meegeleverde APP-CONTEXT (echte recepturen, prijzen, marges, HACCP). Citeer concrete getallen waar relevant; verzin geen cijfers die niet kloppen met de context. " +
    "Gebruik de beschikbare tools om acties echt uit te voeren wanneer de chef daarom vraagt (recept opslaan of aanpassen, HACCP klaarzetten of invullen, leverancier wisselen, navigeren). Beschrijf kort in je proza wat je doet; de tool voert het uit. Voer geen actie uit als er alleen om advies of analyse wordt gevraagd. " +
    "Wanneer een vraag of opdracht over concrete ingrediënten, prijzen of een nieuwe receptuur gaat, gebruik je EERST search_ingredients om echte artikelen en prijzen uit de Hanos/Sligro-catalogus op te halen, en pas daarna reken of stel je voor — verzin geen prijzen. Sla een recept dat je voorstelt ook echt op met save_recipe_version, met de gevonden prijzen als p (prijs per kg/L) en de hoeveelheid als g (gram per couvert). " +
    "APP-CONTEXT (JSON):\n" +
    JSON.stringify(context)
  );
}

// --- Conversatiepersistentie -------------------------------------------------

async function resolveConversation(locationId: string, userId: string, conversationId?: string) {
  if (conversationId) {
    const conv = await prisma.chefConversation.findFirst({
      where: { id: conversationId, locationId, userId },
      select: { id: true },
    });
    if (conv) return conv.id;
  }
  const latest = await prisma.chefConversation.findFirst({
    where: { locationId, userId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (latest) return latest.id;
  const created = await prisma.chefConversation.create({
    data: { locationId, userId },
    select: { id: true },
  });
  return created.id;
}

async function loadHistory(conversationId: string): Promise<LlmMessage[]> {
  const rows = await prisma.chefMessage.findMany({
    where: { conversationId, role: { in: ["USER", "ASSISTANT"] } },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });
  return rows.map((r) =>
    r.role === "USER"
      ? ({ role: "user", content: r.content } as LlmMessage)
      : ({ role: "assistant", content: [{ type: "text", text: r.content }] } as LlmMessage),
  );
}

// --- Publieke API ------------------------------------------------------------

export type ChefTurnResult = {
  conversationId: string;
  text: string;
  actions: ChefAction[];
  navigateTo?: string;
  pendingConfirmation?: { tool: string; summary: string };
};

export async function runChefTurn(params: {
  locationId: string;
  userId: string;
  message: string;
  conversationId?: string;
  autoConfirm?: boolean;
}): Promise<ChefTurnResult> {
  const ctx: ToolContext = { locationId: params.locationId, userId: params.userId };
  const conversationId = await resolveConversation(params.locationId, params.userId, params.conversationId);
  const history = await loadHistory(conversationId);
  const messages: LlmMessage[] = [...history, { role: "user", content: params.message }];

  const system = buildSystem(await buildContext(params.locationId));
  const router = getRouter();

  const result = await runToolLoop(messages, {
    autoConfirm: params.autoConfirm ?? false,
    call: ({ messages: m, toolChoiceNone }) =>
      router.run(
        "tier2",
        { system, messages: m, tools: TOOL_SCHEMAS, toolChoiceNone, maxTokens: llmConfig.maxTokens },
        { locationId: params.locationId },
      ),
    validate: (name, input): Validation => {
      const tool = TOOL_BY_NAME.get(name);
      if (!tool) return { ok: false, error: `onbekende tool ${name}` };
      const parsed = tool.zod.safeParse(input);
      return parsed.success
        ? { ok: true }
        : { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    },
    requiresConfirm: (name) => TOOL_BY_NAME.get(name)?.confirm ?? false,
    execute: async (name, input) => {
      const tool = TOOL_BY_NAME.get(name);
      if (!tool) throw new Error(`onbekende tool ${name}`);
      return tool.execute(input, ctx);
    },
  });

  // Op bevestiging wachten: niets persisteren — de client herhaalt de opdracht
  // met autoConfirm zodra de chef akkoord geeft.
  if (result.pendingConfirmation) {
    return {
      conversationId,
      text: result.text,
      actions: result.actions,
      navigateTo: result.navigateTo,
      pendingConfirmation: { tool: result.pendingConfirmation.tool, summary: result.pendingConfirmation.summary },
    };
  }

  await prisma.$transaction([
    prisma.chefMessage.create({ data: { conversationId, role: "USER", content: params.message } }),
    prisma.chefMessage.create({ data: { conversationId, role: "ASSISTANT", content: result.text } }),
  ]);

  return {
    conversationId,
    text: result.text,
    actions: result.actions,
    navigateTo: result.navigateTo,
  };
}

export type ChefHistory = { conversationId: string | null; messages: { role: "user" | "assistant"; text: string }[] };

export async function getChefHistory(locationId: string, userId: string): Promise<ChefHistory> {
  const conv = await prisma.chefConversation.findFirst({
    where: { locationId, userId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!conv) return { conversationId: null, messages: [] };
  const rows = await prisma.chefMessage.findMany({
    where: { conversationId: conv.id, role: { in: ["USER", "ASSISTANT"] } },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });
  return {
    conversationId: conv.id,
    messages: rows.map((r) => ({ role: r.role === "USER" ? "user" : "assistant", text: r.content })),
  };
}
