"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Decimal } from "decimal.js";
import { prisma } from "@/server/db";
import { getTenant } from "@/server/tenant";
import { CostMode } from "@/generated/prisma/enums";
import type { CatalogResult } from "@/types/recipe";

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
