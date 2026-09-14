"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { getTenant } from "@/server/tenant";

// Toggle de favoriet-markering van een gerecht (locatie-gescopet).
export async function toggleFavorite(input: { recipeId: string }) {
  const { locationId } = await getTenant();
  const { recipeId } = z.object({ recipeId: z.string().min(1) }).parse(input);

  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, locationId },
    select: { favorite: true },
  });
  if (!recipe) throw new Error("Recept niet gevonden in deze locatie.");

  await prisma.recipe.update({ where: { id: recipeId }, data: { favorite: !recipe.favorite } });
  revalidatePath("/library");
}

// Markeer een recept als "alleen component" (sub-recept). Zulke recepten worden
// uit de menu-overzichten (Library/Matrix/chef-context) gefilterd; ze blijven
// bereikbaar via de componentkoppeling in een ander recept.
export async function setComponentOnly(input: { recipeId: string; value: boolean }) {
  const { locationId } = await getTenant();
  const { recipeId, value } = z
    .object({ recipeId: z.string().min(1), value: z.boolean() })
    .parse(input);

  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, locationId },
    select: { id: true },
  });
  if (!recipe) throw new Error("Recept niet gevonden in deze locatie.");

  // Houd isOnMenu consistent: een alleen-component recept staat niet op de kaart,
  // en terugzetten naar normaal maakt het weer verkoopbaar.
  await prisma.recipe.update({
    where: { id: recipeId },
    data: { componentOnly: value, isOnMenu: !value },
  });
  revalidatePath("/library");
  revalidatePath("/matrix");
  revalidatePath("/lab");
}

// Verwijder een recept volledig uit de bibliotheek (locatie-gescopet). Dit raakt
// ook alle receptversies en hun ingrediënten: die gaan mee via ON DELETE CASCADE
// (RecipeVersion.recipeId → Recipe, RecipeIngredient.versionId → RecipeVersion).
// We maken eerst de actieve-versie-koppeling los, zodat de FK Recipe.activeVersionId
// het cascaderen niet blokkeert.
export async function deleteRecipe(input: { recipeId: string }) {
  const { locationId } = await getTenant();
  const { recipeId } = z.object({ recipeId: z.string().min(1) }).parse(input);

  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, locationId },
    select: { id: true },
  });
  if (!recipe) throw new Error("Recept niet gevonden in deze locatie.");

  // Beschermd: een recept dat elders als component wordt gebruikt, mag niet zomaar
  // verdwijnen (dat zou de kostprijs van het parent-gerecht stilletjes breken).
  const usedIn = await prisma.recipeComponent.findMany({
    where: { childRecipeId: recipeId },
    select: { parentVersion: { select: { recipe: { select: { dish: true } } } } },
  });
  if (usedIn.length > 0) {
    const dishes = Array.from(new Set(usedIn.map((u) => u.parentVersion.recipe.dish)));
    throw new Error(`Kan niet verwijderen: wordt gebruikt als component in ${dishes.join(", ")}.`);
  }

  await prisma.$transaction([
    prisma.recipe.update({ where: { id: recipeId }, data: { activeVersionId: null } }),
    prisma.recipe.delete({ where: { id: recipeId } }),
  ]);

  revalidatePath("/library");
  revalidatePath("/lab");
  revalidatePath("/matrix");
}
