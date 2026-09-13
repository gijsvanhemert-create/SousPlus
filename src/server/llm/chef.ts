import { prisma } from "@/server/db";
import { recipeCost } from "@/lib/cost";
import type { CostMode } from "@/lib/cost";
import { FLAVOR_DB } from "@/lib/flavor-data";
import { getRouter } from "./router";
import { llmConfig } from "./config";
import { TOOL_SCHEMAS, TOOL_BY_NAME, type ChefAction, type ToolContext } from "./tools";
import { runToolLoop, type Validation } from "./loop";
import type { LlmMessage } from "./types";

// Chef Auguste: bouwt de live APP-CONTEXT, draait de tool-loop via de router en
// bewaart de conversatie in de database zodat ze behouden blijft bij navigeren en
// herladen (verbeterpunt t.o.v. het prototype: state buiten de component).

// --- APP-CONTEXT -------------------------------------------------------------

// Structurele types (los van Prisma) zodat de mapping puur en testbaar is.
type DecimalLike = { toString(): string };
type CtxIngredient = { name: string; amount: DecimalLike; unit: string; mode: string; pricePerUnit: DecimalLike };
type CtxActiveVersion = { id: string; label: string; name: string; ingredients: CtxIngredient[] };
export type CtxRecipe = {
  id: string;
  dish: string;
  category: string;
  menuPrice: DecimalLike;
  popularity: number;
  activeVersion: CtxActiveVersion | null;
  versions: { id: string; label: string; name: string }[];
};

// Zet database-recepten om naar de APP-CONTEXT die Chef Auguste ziet. Cruciaal:
// we geven de ECHTE id's mee (recipeId, activeVersion.id, en per versie een id +
// label). Zonder die id's kan het model update_recipe_version / save_recipe_version
// niet gericht aanroepen en gokt het een id dat nooit matcht → "versie niet
// gevonden". Alles is al op locationId gefilterd door de query hierboven.
export function buildMenuContext(recipes: CtxRecipe[]) {
  return recipes.map((r) => {
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
      recipeId: r.id,
      dish: r.dish,
      category: r.category,
      menuPrice: Number(r.menuPrice),
      popularity: r.popularity,
      marginPct: cost ? Number(cost.marginPct.toFixed(1)) : null,
      foodcostPerCover: cost ? Number(cost.foodcostPerCover.toFixed(2)) : null,
      activeVersion: v ? { id: v.id, label: v.label, name: v.name } : null,
      // Alle versies met id + label, zodat update_recipe_version het juiste
      // versie-id kan meekrijgen (id = versie-id).
      versions: r.versions.map((ver) => ({ id: ver.id, label: ver.label, name: ver.name })),
      ingredients:
        v?.ingredients.map((i) => ({ name: i.name, perCover: `${i.amount}${i.unit}`, pricePerUnit: Number(i.pricePerUnit) })) ?? [],
    };
  });
}

async function buildContext(locationId: string) {
  const [recipes, catalogCount, checkpoints] = await Promise.all([
    prisma.recipe.findMany({
      where: { locationId },
      include: {
        activeVersion: { include: { ingredients: true } },
        versions: { select: { id: true, label: true, name: true }, orderBy: { createdAt: "asc" } },
      },
      orderBy: [{ favorite: "desc" }, { dish: "asc" }],
    }),
    prisma.catalogItem.count({ where: { locationId } }),
    prisma.haccpCheckpoint.findMany({
      where: { locationId, active: true },
      select: { zone: true, target: true },
    }),
  ]);

  return {
    location: locationId,
    catalogSize: catalogCount,
    haccp: checkpoints,
    menu: buildMenuContext(recipes),
    flavor: buildFlavorContext(),
  };
}

// De GECUREERDE affinity-set (bron van waarheid voor exacte scores). Bewust
// beperkt: alleen deze basisingrediënten hebben een affinity-score uit onze data.
// Voor al het andere leunt Chef Auguste op zijn eigen culinaire kennis (expliciet
// als inzicht, niet als score). De bredere Foodpairing®-koppeling volgt in fase 2;
// dit verandert alleen wat Auguste in het gesprek mag zeggen, niet de Flavor
// Matcher-module zelf.
export function buildFlavorContext() {
  return {
    note:
      "Gecureerde affinity-set (beperkt). Alleen curatedIngredients hebben een geverifieerde affinity-score uit onze data; voor al het overige gebruik je je eigen culinaire kennis als inzicht, nooit als exacte score.",
    curatedIngredients: Object.keys(FLAVOR_DB),
    pairings: FLAVOR_DB,
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
    "Elk gerecht in de APP-CONTEXT heeft een recipeId, een activeVersion met een id, en een lijst versions met per versie een id + label. Gebruik ALTIJD deze echte id's uit de context — verzin of gok NOOIT een id. Voor update_recipe_version geef je id = het versie-id mee (meestal activeVersion.id, of het bijpassende id uit versions). Voor een nieuwe versie van een BESTAAND recept geef je recipeId mee aan save_recipe_version. " +
    "Als een tool een fout teruggeeft, presenteer je het resultaat NOOIT alsof het gelukt is: meld eerlijk en beknopt dat het niet lukte. Cijfers als marge en foodcost baseer je uitsluitend op de APP-CONTEXT (huidige staat); een uitkomst ná een wijziging die niet is opgeslagen noem je expliciet 'verwacht/na aanpassing', nooit als vaststaand feit. " +
    "Bij vragen over smaakcombinaties/pairings: de APP-CONTEXT bevat onder 'flavor' een GECUREERDE affinity-set (flavor.curatedIngredients + flavor.pairings), nu beperkt tot enkele basisingrediënten. Zit het gevraagde ingrediënt in die set, dan mag je een concrete match presenteren als 'affinity-score X uit onze data'. Zit het ingrediënt of de combinatie er NIET in (bv. eendenlever, miso als basis, en de meeste andere), zeg dan NOOIT dat je het niet weet en verzin NOOIT een exacte score: gebruik je eigen brede culinaire kennis als AI om onderbouwd te adviseren — welke smaken, texturen en bereidingen samengaan en waarom — en frame dat expliciet als culinair inzicht ('op basis van culinaire ervaring'), niet als een geverifieerd datapunt. Maak het onderscheid tussen beide bronnen in je antwoord altijd duidelijk. De gecureerde set is een tussenstap; de bredere Foodpairing®-koppeling volgt in fase 2. " +
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
