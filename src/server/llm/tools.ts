import { z } from "zod";
import { prisma } from "@/server/db";
import { CostMode } from "@/generated/prisma/enums";
import { appendRecord } from "@/server/haccp/records";
import { switchSupplierFor } from "@/server/supplier-switch";
import { normalizeWeightUnit } from "@/lib/units";
import type { ToolSchema } from "./types";

// Server-side tool-definities voor Chef Auguste. Per tool:
//   - input_schema : JSON-schema dat naar het model gaat (Anthropic tool-use)
//   - zod          : server-side validatie van de tool-input VÓÓR uitvoering
//   - confirm      : true ⇒ bevestiging vereist (destructief/overschrijvend)
//   - cacheable    : true ⇒ geschikt voor Tier 1 response-caching (lezen)
//   - execute      : voert de actie uit, altijd gescopet op locationId
// De tool-input volgt de prototype-woordenschat (g = gram per couvert,
// p = inkoopprijs per kg/L) en wordt in de executor naar het Prisma-datamodel
// vertaald (amount/pricePerUnit/CostMode).

export type ToolContext = { locationId: string; userId: string };

export type ChefAction = {
  kind: "recipe" | "haccp" | "supplier" | "navigate" | "search";
  label: string;
  detail?: string;
  href?: string;
};

export type ToolOutcome = {
  /** Tekst die als tool_result terug naar het model gaat. */
  text: string;
  /** Optionele UI-chip ("chef's pass"-resultaat). */
  action?: ChefAction;
  /** Optionele navigatie-instructie voor de client. */
  navigateTo?: string;
};

export type ChefTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  zod: z.ZodTypeAny;
  confirm: boolean;
  cacheable?: boolean;
  execute: (input: unknown, ctx: ToolContext) => Promise<ToolOutcome>;
};

const ING_JSON = {
  type: "array",
  items: {
    type: "object",
    properties: {
      name: { type: "string" },
      g: {
        type: "number",
        description:
          "Hoeveelheid per couvert in GRAM (weight) of ml (volume), NIET in kg/L. Reken de catalogus-eenheid om: 0,08 kg = 80.",
      },
      unit: { type: "string", description: 'Alleen "g" of "ml" (weight), of een stukseenheid (piece). Nooit de catalogus-eenheid kg/L.' },
      p: { type: "number", description: "Inkoopprijs per kg/L (weight) of per stuk (piece), zoals in de catalogus." },
      mode: { type: "string", enum: ["weight", "piece"] },
    },
  },
};

const ingredientZod = z.array(
  z.object({
    name: z.string().min(1),
    g: z.number().nonnegative(),
    unit: z.string().optional(),
    p: z.number().nonnegative(),
    mode: z.enum(["weight", "piece"]).optional(),
  }),
);

type IngredientInput = z.infer<typeof ingredientZod>[number];

// WEIGHT-ingrediënten worden ALTIJD in gram/ml per couvert opgeslagen (zie
// lib/units.ts): de catalogus-eenheid (kg/L) is alleen een prijsbasis en mag
// nooit als opslag-eenheid worden overgenomen, anders krijg je onzin als
// "80 kg per couvert". De unit normaliseren we server-side naar "g"/"ml"; de
// hoeveelheid laten we ongemoeid (die is per contract al grammen/ml).
function toIngredientCreate(i: IngredientInput) {
  const isPiece = i.mode === "piece";
  return {
    name: i.name,
    amount: i.g.toString(),
    unit: isPiece ? (i.unit?.trim() || "stuk") : normalizeWeightUnit(i.unit),
    mode: isPiece ? CostMode.PIECE : CostMode.WEIGHT,
    pricePerUnit: i.p.toString(),
  };
}

// --- search_ingredients ------------------------------------------------------

const searchZod = z.object({
  query: z.string().min(1),
  category: z.string().optional(),
  supplier: z.enum(["Hanos", "Sligro", "Beide"]).optional(),
  max: z.number().optional(),
});

const searchTool: ChefTool = {
  name: "search_ingredients",
  description:
    "Doorzoek de Hanos/Sligro-catalogus op concrete artikelen, eenheden en prijzen. Gebruik dit vóór je een gerecht voorstelt of een receptuur opslaat, zodat je met echte prijzen rekent.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string" },
      category: { type: "string" },
      supplier: { type: "string", enum: ["Hanos", "Sligro", "Beide"] },
      max: { type: "number" },
    },
    required: ["query"],
  },
  zod: searchZod,
  confirm: false,
  cacheable: true,
  async execute(input, ctx) {
    const { query, category, supplier, max } = searchZod.parse(input);
    const take = Math.min(Math.max(Math.trunc(max ?? 12), 1), 25);
    const items = await prisma.catalogItem.findMany({
      where: {
        locationId: ctx.locationId,
        AND: [
          {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { category: { contains: query, mode: "insensitive" } },
            ],
          },
          category ? { category: { contains: category, mode: "insensitive" } } : {},
          supplier && supplier !== "Beide" ? { supplier: supplier === "Hanos" ? "HANOS" : "SLIGRO" } : {},
        ],
      },
      orderBy: { price: "asc" },
      take,
    });
    const mapped = items.map((i) => ({
      name: i.name,
      category: i.category,
      supplier: i.supplier,
      unit: i.unit,
      price: Number(i.price),
    }));
    return {
      text: JSON.stringify({ count: mapped.length, items: mapped }),
      action: { kind: "search", label: `${mapped.length} artikelen gevonden`, detail: query },
    };
  },
};

// --- save_recipe_version -----------------------------------------------------

const saveZod = z.object({
  recipeId: z.string().optional(),
  dish: z.string().optional(),
  category: z.string().optional(),
  label: z.string().optional(),
  name: z.string().min(1),
  note: z.string().optional(),
  menuPrice: z.number().positive().optional(),
  prepTime: z.number().int().nonnegative().optional(),
  ingredients: ingredientZod.optional(),
  prep: z.array(z.string()).optional(),
});

const saveTool: ChefTool = {
  name: "save_recipe_version",
  description:
    "Sla een nieuwe receptversie op in het versiebeheer en open deze in de Recipe Lab. g = gram per couvert, p = inkoopprijs per kg/L.",
  input_schema: {
    type: "object",
    properties: {
      recipeId: { type: "string" },
      dish: { type: "string", description: "Gerechtnaam" },
      category: { type: "string" },
      label: { type: "string" },
      name: { type: "string" },
      note: { type: "string" },
      menuPrice: { type: "number" },
      prepTime: { type: "number" },
      ingredients: ING_JSON,
      prep: { type: "array", items: { type: "string" } },
    },
    required: ["name"],
  },
  zod: saveZod,
  confirm: false,
  async execute(input, ctx) {
    const d = saveZod.parse(input);

    let recipeId = d.recipeId;
    if (recipeId) {
      const owned = await prisma.recipe.findFirst({
        where: { id: recipeId, locationId: ctx.locationId },
        select: { id: true },
      });
      if (!owned) throw new Error("Recept niet gevonden in deze locatie.");
    } else {
      if (!d.dish) throw new Error("Geef een gerechtnaam (dish) op voor een nieuw recept.");
      const created = await prisma.recipe.create({
        data: {
          locationId: ctx.locationId,
          dish: d.dish,
          category: d.category ?? "Overig",
          menuPrice: (d.menuPrice ?? 0).toFixed(2),
        },
      });
      recipeId = created.id;
    }

    // Volgend label automatisch bepalen wanneer niet meegegeven.
    const count = await prisma.recipeVersion.count({ where: { recipeId } });
    const label = d.label ?? `v1.${count}`;

    const version = await prisma.recipeVersion.create({
      data: {
        recipeId,
        label,
        name: d.name,
        note: d.note ?? null,
        prepTimeMin: d.prepTime ?? 0,
        steps: d.prep ?? [],
        ingredients: { create: (d.ingredients ?? []).map(toIngredientCreate) },
      },
    });

    await prisma.recipe.update({
      where: { id: recipeId },
      data: {
        activeVersionId: version.id,
        ...(d.menuPrice ? { menuPrice: d.menuPrice.toFixed(2) } : {}),
        ...(d.dish ? { dish: d.dish } : {}),
      },
    });

    // Open in de Lab exact het zojuist opgeslagen recept (niet het standaardgerecht).
    const href = `/lab?recipe=${encodeURIComponent(recipeId)}`;
    return {
      text: `Opgeslagen als ${label} · ${d.name}.`,
      // Geen automatische navigatie: de gebruiker springt zelf via de knop.
      action: { kind: "recipe", label: `Opgeslagen: ${label} · ${d.name}`, href },
    };
  },
};

// --- update_recipe_version (overschrijvend ⇒ bevestiging) --------------------

const updateZod = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  dish: z.string().optional(),
  note: z.string().optional(),
  menuPrice: z.number().positive().optional(),
  prepTime: z.number().int().nonnegative().optional(),
  ingredients: ingredientZod.optional(),
  prep: z.array(z.string()).optional(),
});

const updateTool: ChefTool = {
  name: "update_recipe_version",
  description:
    "Pas een bestaande receptversie aan. id = het versie-id uit de APP-CONTEXT (activeVersion.id of een id uit versions), nooit een verzonnen of geraden id. Geef alleen de velden mee die wijzigen.",
  input_schema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Versie-id uit de APP-CONTEXT (activeVersion.id / versions[].id)." },
      name: { type: "string" },
      dish: { type: "string" },
      note: { type: "string" },
      menuPrice: { type: "number" },
      prepTime: { type: "number" },
      ingredients: ING_JSON,
      prep: { type: "array", items: { type: "string" } },
    },
    required: ["id"],
  },
  zod: updateZod,
  confirm: true,
  async execute(input, ctx) {
    const d = updateZod.parse(input);
    const version = await prisma.recipeVersion.findFirst({
      where: { id: d.id, recipe: { locationId: ctx.locationId } },
      select: { id: true, recipeId: true },
    });
    if (!version) throw new Error("Receptversie niet gevonden in deze locatie.");

    await prisma.recipeVersion.update({
      where: { id: d.id },
      data: {
        ...(d.name ? { name: d.name } : {}),
        ...(d.note !== undefined ? { note: d.note } : {}),
        ...(d.prepTime !== undefined ? { prepTimeMin: d.prepTime } : {}),
        ...(d.prep ? { steps: d.prep } : {}),
        ...(d.ingredients
          ? { ingredients: { deleteMany: {}, create: d.ingredients.map(toIngredientCreate) } }
          : {}),
      },
    });
    if (d.menuPrice || d.dish) {
      await prisma.recipe.update({
        where: { id: version.recipeId },
        data: {
          ...(d.menuPrice ? { menuPrice: d.menuPrice.toFixed(2) } : {}),
          ...(d.dish ? { dish: d.dish } : {}),
        },
      });
    }
    // Open in de Lab exact het zojuist bewerkte recept (niet het standaardgerecht).
    const href = `/lab?recipe=${encodeURIComponent(version.recipeId)}`;
    return {
      text: "Receptversie bijgewerkt.",
      // Geen automatische navigatie: de gebruiker springt zelf via de knop.
      action: { kind: "recipe", label: "Receptversie bijgewerkt", href },
    };
  },
};

// --- prepare_haccp -----------------------------------------------------------

const prepareHaccpZod = z.object({
  entries: z
    .array(
      z.object({
        zone: z.string().min(1),
        target: z.string().optional(),
        limit: z.number(),
        cmp: z.enum(["lte", "gte"]),
        unit: z.string().optional(),
      }),
    )
    .optional(),
});

const prepareHaccpTool: ChefTool = {
  name: "prepare_haccp",
  description: "Zet een HACCP-dagstaat klaar (zonder entries = standaard dagstaat).",
  input_schema: {
    type: "object",
    properties: {
      entries: {
        type: "array",
        items: {
          type: "object",
          properties: {
            zone: { type: "string" },
            target: { type: "string" },
            limit: { type: "number" },
            cmp: { type: "string", enum: ["lte", "gte"] },
            unit: { type: "string" },
          },
        },
      },
    },
  },
  zod: prepareHaccpZod,
  confirm: false,
  async execute(input, ctx) {
    const d = prepareHaccpZod.parse(input);
    if (d.entries && d.entries.length > 0) {
      for (const e of d.entries) {
        const existing = await prisma.haccpCheckpoint.findFirst({
          where: { locationId: ctx.locationId, zone: e.zone },
          select: { id: true },
        });
        const data = {
          zone: e.zone,
          target: e.target ?? `${e.cmp === "lte" ? "≤" : "≥"} ${e.limit} ${e.unit ?? ""}`.trim(),
          limitValue: e.limit.toString(),
          cmp: e.cmp === "lte" ? ("LTE" as const) : ("GTE" as const),
          unit: e.unit ?? "°C",
          active: true,
        };
        if (existing) await prisma.haccpCheckpoint.update({ where: { id: existing.id }, data });
        else await prisma.haccpCheckpoint.create({ data: { ...data, locationId: ctx.locationId } });
      }
    }
    const active = await prisma.haccpCheckpoint.count({
      where: { locationId: ctx.locationId, active: true },
    });
    return {
      text: `Dagstaat klaargezet met ${active} registratiepunten.`,
      // Geen automatische navigatie: de gebruiker springt zelf via de knop.
      action: { kind: "haccp", label: `HACCP-dagstaat klaar (${active} punten)`, href: "/haccp" },
    };
  },
};

// --- fill_haccp (norm-check; append-only registratie volgt in fase 5) --------

const fillHaccpZod = z.object({
  values: z
    .array(z.object({ zone: z.string().min(1), value: z.string().min(1), time: z.string().optional() }))
    .min(1),
});

const fillHaccpTool: ChefTool = {
  name: "fill_haccp",
  description: "Vul gemeten waardes in op de HACCP-dagstaat; match op zone-naam.",
  input_schema: {
    type: "object",
    properties: {
      values: {
        type: "array",
        items: {
          type: "object",
          properties: { zone: { type: "string" }, value: { type: "string" }, time: { type: "string" } },
        },
      },
    },
    required: ["values"],
  },
  zod: fillHaccpZod,
  confirm: false,
  async execute(input, ctx) {
    const d = fillHaccpZod.parse(input);
    const checkpoints = await prisma.haccpCheckpoint.findMany({
      where: { locationId: ctx.locationId, active: true },
    });
    // Elke meting wordt onveranderlijk vastgelegd in de append-only hash-chain
    // (ondertekend door Chef Auguste namens de verantwoordelijke gebruiker).
    const evaluated: { zone: string; value?: string; status: string }[] = [];
    for (const v of d.values) {
      const cp = checkpoints.find((c) => c.zone.toLowerCase().includes(v.zone.toLowerCase()));
      if (!cp) {
        evaluated.push({ zone: v.zone, status: "ONBEKEND" });
        continue;
      }
      const num = Number(String(v.value).replace(",", "."));
      if (!Number.isFinite(num)) {
        evaluated.push({ zone: cp.zone, value: v.value, status: "ONGELDIG" });
        continue;
      }
      const res = await appendRecord({
        locationId: ctx.locationId,
        checkpointId: cp.id,
        value: num,
        signedById: ctx.userId,
        signedByName: "Chef Auguste",
      });
      evaluated.push({ zone: cp.zone, value: v.value, status: res.status });
    }
    const attention = evaluated.filter((e) => e.status === "ATTENTION").length;
    return {
      text: JSON.stringify({ evaluated, attention, note: "Metingen vastgelegd in de HACCP-audit trail (append-only)." }),
      action: {
        kind: "haccp",
        label: attention > 0 ? `${attention} meting(en) buiten norm` : "Alle metingen binnen norm",
        href: "/haccp",
      },
      // Geen automatische navigatie: de gebruiker springt zelf via de knop.
    };
  },
};

// --- switch_supplier (overschrijvend ⇒ bevestiging) --------------------------

const switchZod = z.object({ ingredient: z.string().min(1) });

const switchTool: ChefTool = {
  name: "switch_supplier",
  description: "Wissel de leverancier van een ingrediënt naar een goedkoper alternatief.",
  input_schema: {
    type: "object",
    properties: { ingredient: { type: "string" } },
    required: ["ingredient"],
  },
  zod: switchZod,
  confirm: true,
  async execute(input, ctx) {
    const { ingredient } = switchZod.parse(input);
    const res = await switchSupplierFor(ctx.locationId, ingredient);
    if (!res.switched) return { text: res.message };
    return {
      text: res.message,
      // Geen automatische navigatie: de gebruiker springt zelf via de knop.
      action: { kind: "supplier", label: `Leverancier gewisseld: ${ingredient}`, detail: res.detail, href: "/supplier" },
    };
  },
};

// --- navigate_app ------------------------------------------------------------

const NAV_TABS = ["chef", "lab", "flavor", "supplier", "ingredients", "ocr", "haccp", "library", "matrix"] as const;
const navZod = z.object({ tab: z.enum(NAV_TABS) });

const navigateTool: ChefTool = {
  name: "navigate_app",
  description: "Navigeer naar een module van de app.",
  input_schema: {
    type: "object",
    properties: { tab: { type: "string", enum: [...NAV_TABS] } },
    required: ["tab"],
  },
  zod: navZod,
  confirm: false,
  async execute(input) {
    const { tab } = navZod.parse(input);
    return {
      text: `Geopend: ${tab}.`,
      action: { kind: "navigate", label: `Geopend: ${tab}`, href: `/${tab}` },
      navigateTo: `/${tab}`,
    };
  },
};

export const CHEF_TOOLS: ChefTool[] = [
  searchTool,
  saveTool,
  updateTool,
  prepareHaccpTool,
  fillHaccpTool,
  switchTool,
  navigateTool,
];

export const TOOL_SCHEMAS: ToolSchema[] = CHEF_TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.input_schema,
}));

export const TOOL_BY_NAME: Map<string, ChefTool> = new Map(CHEF_TOOLS.map((t) => [t.name, t]));
