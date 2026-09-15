"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Decimal } from "decimal.js";
import { prisma } from "@/server/db";
import { getTenant } from "@/server/tenant";
import { CostMode } from "@/generated/prisma/enums";
import { assertComponentAllowed } from "@/server/recipe-cost-graph";
import { linkComponent, type LinkComponentResult } from "@/server/components";
import type { CatalogResult, CandidateRecipe } from "@/types/recipe";

// Mutaties op de Recipe Lab. Elke actie:
//  1. verifieert de sessie (getTenant) en scopt op de eigen locationId,
//  2. valideert de input met zod,
//  3. controleert dat de resource écht bij deze locatie hoort (geen IDOR),
//  4. revalideert /lab zodat de UI de nieuwe waarheid toont.

const LAB_PATH = "/lab";

/** Genormaliseerd Decimal-bedrag (komma → punt), niet-negatief. */
const decimalString = (maxDp: number) =>
  z
    .string()
    .trim()
    .transform((s) => s.replace(",", "."))
    .refine((s) => /^\d+(\.\d+)?$/.test(s), "Ongeldig getal")
    .transform((s) => new Decimal(s).toDecimalPlaces(maxDp))
    .refine((d) => d.gte(0), "Mag niet negatief zijn");

async function assertOwnsIngredient(ingredientId: string, locationId: string) {
  const ing = await prisma.recipeIngredient.findFirst({
    where: { id: ingredientId, version: { recipe: { locationId } } },
    select: { id: true },
  });
  if (!ing) throw new Error("Ingrediënt niet gevonden in deze locatie.");
}

// --- Hoeveelheid aanpassen ---------------------------------------------------

const updateAmountSchema = z.object({
  ingredientId: z.string().min(1),
  amount: decimalString(3),
});

export async function updateIngredientAmount(input: {
  ingredientId: string;
  amount: string;
}) {
  const { locationId } = await getTenant();
  const { ingredientId, amount } = updateAmountSchema.parse(input);
  await assertOwnsIngredient(ingredientId, locationId);

  await prisma.recipeIngredient.update({
    where: { id: ingredientId },
    data: { amount: amount.toString() },
  });
  revalidatePath(LAB_PATH);
}

// --- Ingrediënt verwijderen --------------------------------------------------

export async function removeIngredient(input: { ingredientId: string }) {
  const { locationId } = await getTenant();
  const { ingredientId } = z.object({ ingredientId: z.string().min(1) }).parse(input);
  await assertOwnsIngredient(ingredientId, locationId);

  await prisma.recipeIngredient.delete({ where: { id: ingredientId } });
  revalidatePath(LAB_PATH);
}

// --- Ingrediënt toevoegen uit de catalogus -----------------------------------

export async function addIngredientFromCatalog(input: {
  versionId: string;
  catalogItemId: string;
}) {
  const { locationId } = await getTenant();
  const { versionId, catalogItemId } = z
    .object({ versionId: z.string().min(1), catalogItemId: z.string().min(1) })
    .parse(input);

  // Beide resources moeten bij deze locatie horen.
  const [version, item] = await Promise.all([
    prisma.recipeVersion.findFirst({
      where: { id: versionId, recipe: { locationId } },
      select: { id: true, ingredients: { select: { catalogItemId: true } } },
    }),
    prisma.catalogItem.findFirst({
      where: { id: catalogItemId, locationId },
      select: { id: true, name: true, unit: true, price: true },
    }),
  ]);
  if (!version) throw new Error("Receptversie niet gevonden in deze locatie.");
  if (!item) throw new Error("Catalogusartikel niet gevonden in deze locatie.");

  // Geen dubbele catalogusregels in dezelfde versie (mirror prototype).
  if (version.ingredients.some((i) => i.catalogItemId === catalogItemId)) {
    revalidatePath(LAB_PATH);
    return;
  }

  // kg/L → WEIGHT (gram/ml, prijs per kg/L); al het andere → PIECE (per stuk).
  const isWeight = item.unit === "kg" || item.unit === "L";
  const unit = isWeight ? (item.unit === "L" ? "ml" : "g") : item.unit;

  await prisma.recipeIngredient.create({
    data: {
      versionId,
      catalogItemId: item.id,
      name: item.name,
      amount: isWeight ? "50" : "1",
      unit,
      mode: isWeight ? CostMode.WEIGHT : CostMode.PIECE,
      pricePerUnit: item.price.toString(),
    },
  });
  revalidatePath(LAB_PATH);
}

// --- Actieve (menu-)versie wisselen ------------------------------------------

export async function setActiveVersion(input: {
  recipeId: string;
  versionId: string;
}) {
  const { locationId } = await getTenant();
  const { recipeId, versionId } = z
    .object({ recipeId: z.string().min(1), versionId: z.string().min(1) })
    .parse(input);

  const version = await prisma.recipeVersion.findFirst({
    where: { id: versionId, recipeId, recipe: { locationId } },
    select: { id: true },
  });
  if (!version) throw new Error("Receptversie niet gevonden in deze locatie.");

  await prisma.recipe.update({
    where: { id: recipeId },
    data: { activeVersionId: versionId },
  });
  revalidatePath(LAB_PATH);
}

// --- Catalogus doorzoeken (picker) -------------------------------------------

export async function searchCatalog(query: string): Promise<CatalogResult[]> {
  const { locationId } = await getTenant();
  const term = query.trim();

  const items = await prisma.catalogItem.findMany({
    where: {
      locationId,
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: "insensitive" } },
              { category: { contains: term, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    take: 40,
  });

  return items.map((i) => ({
    id: i.id,
    name: i.name,
    category: i.category,
    supplier: i.supplier,
    unit: i.unit,
    price: i.price.toString(),
  }));
}

// --- Componenten / sub-recepten ----------------------------------------------

// Component-mutaties raken ook de marges in Library/Matrix, dus we revalideren
// die routes mee.
function revalidateRecipeSurfaces() {
  revalidatePath(LAB_PATH);
  revalidatePath("/library");
  revalidatePath("/matrix");
}

async function loadOwnedComponent(componentId: string, locationId: string) {
  const comp = await prisma.recipeComponent.findFirst({
    where: { id: componentId, parentVersion: { recipe: { locationId } } },
    select: { id: true, childRecipeId: true, parentVersion: { select: { recipeId: true } } },
  });
  if (!comp) throw new Error("Component niet gevonden in deze locatie.");
  return comp;
}

/** Bestaande recepten die als component toegevoegd kunnen worden (geen self/cyclus). */
export async function searchRecipesForComponent(
  query: string,
  parentRecipeId: string,
): Promise<CandidateRecipe[]> {
  const { locationId } = await getTenant();
  const parsedParent = z.string().min(1).parse(parentRecipeId);
  const term = query.trim();

  const recipes = await prisma.recipe.findMany({
    where: {
      locationId,
      activeVersionId: { not: null }, // moet een pinbare versie hebben
      NOT: { id: parsedParent },
      ...(term ? { dish: { contains: term, mode: "insensitive" } } : {}),
    },
    orderBy: { dish: "asc" },
    take: 40,
    select: { id: true, dish: true, category: true, activeVersion: { select: { id: true, label: true } } },
  });

  // Cyclus-kandidaten eruit filteren: recepten die (indirect) al naar de parent
  // verwijzen zouden een lus maken.
  const candidates: CandidateRecipe[] = [];
  for (const r of recipes) {
    if (!r.activeVersion) continue;
    try {
      await assertComponentAllowed(locationId, parsedParent, r.id);
    } catch {
      continue; // cyclus of te diep → niet aanbieden
    }
    candidates.push({
      id: r.id,
      dish: r.dish,
      category: r.category,
      activeVersionId: r.activeVersion.id,
      versionLabel: r.activeVersion.label,
    });
  }
  return candidates;
}

export type AddComponentResult = LinkComponentResult;

/** Voeg een component toe (UI-action); pint op de actieve versie van het kind-recept.
 * Dunne wrapper rond de gedeelde linkComponent-kern. */
export async function addComponent(input: {
  parentVersionId: string;
  childRecipeId: string;
}): Promise<AddComponentResult | undefined> {
  const { locationId } = await getTenant();
  const { parentVersionId, childRecipeId } = z
    .object({ parentVersionId: z.string().min(1), childRecipeId: z.string().min(1) })
    .parse(input);

  const res = await linkComponent({ locationId, parentVersionId, childRecipeId });
  revalidateRecipeSurfaces();
  return res;
}

/** Pas de gebruikte hoeveelheid van een component aan (per couvert van de parent). */
export async function updateComponentAmount(input: { componentId: string; amount: string }) {
  const { locationId } = await getTenant();
  const { componentId, amount } = z
    .object({ componentId: z.string().min(1), amount: decimalString(3) })
    .parse(input);
  await loadOwnedComponent(componentId, locationId);

  await prisma.recipeComponent.update({
    where: { id: componentId },
    data: { amount: amount.toString() },
  });
  revalidateRecipeSurfaces();
}

/** Verwijder een component uit een receptversie. */
export async function removeComponent(input: { componentId: string }) {
  const { locationId } = await getTenant();
  const { componentId } = z.object({ componentId: z.string().min(1) }).parse(input);
  await loadOwnedComponent(componentId, locationId);

  await prisma.recipeComponent.delete({ where: { id: componentId } });
  revalidateRecipeSurfaces();
}

/** Herpin een component op de huidige actieve versie van het kind-recept. */
export async function repointComponentToActive(input: { componentId: string }) {
  const { locationId } = await getTenant();
  const { componentId } = z.object({ componentId: z.string().min(1) }).parse(input);
  const comp = await loadOwnedComponent(componentId, locationId);

  const child = await prisma.recipe.findFirst({
    where: { id: comp.childRecipeId, locationId },
    select: { activeVersionId: true },
  });
  if (!child?.activeVersionId) throw new Error("Component-recept heeft geen actieve versie.");

  // Zelfde kind-recept, dus recept-graaf ongewijzigd; her-valideren voor de zekerheid.
  await assertComponentAllowed(locationId, comp.parentVersion.recipeId, comp.childRecipeId);

  await prisma.recipeComponent.update({
    where: { id: componentId },
    data: { childVersionId: child.activeVersionId },
  });
  revalidateRecipeSurfaces();
}
