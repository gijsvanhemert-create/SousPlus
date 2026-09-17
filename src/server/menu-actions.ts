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

// Handmatige invoer van het verkoopvolume (couverts per maand) voor de Menu
// Matrix — een eerlijk tussenstation tot er een echte kassakoppeling is. Zet naast
// de waarde ook popularityUpdatedAt = nu, zodat verouderde data zichtbaar is als
// verouderd. Locatie-gescopet; niet-negatief geheel getal met een redelijke bovengrens.
const popularitySchema = z.object({
  recipeId: z.string().min(1),
  coversPerMonth: z.number().int().min(0).max(100_000),
});

export async function updatePopularity(input: { recipeId: string; coversPerMonth: number }) {
  const { locationId } = await getTenant();
  const { recipeId, coversPerMonth } = popularitySchema.parse(input);

  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, locationId },
    select: { id: true },
  });
  if (!recipe) throw new Error("Recept niet gevonden in deze locatie.");

  await prisma.recipe.update({
    where: { id: recipeId },
    data: { popularity: coversPerMonth, popularityUpdatedAt: new Date() },
  });
  revalidatePath("/matrix");
}

// Verwijder een recept volledig uit de bibliotheek (locatie-gescopet). Dit raakt
// ook alle receptversies en hun ingrediënten: die gaan mee via ON DELETE CASCADE
// (RecipeVersion.recipeId → Recipe, RecipeIngredient.versionId → RecipeVersion).
// Expliciet ok/error resultaat (net als de OCR-/Lab-flows), zodat de UI de echte
// oorzaak kan tonen i.p.v. een generieke "probeer opnieuw" — met name de nuttige
// "wordt gebruikt als component in …"-melding, waar opnieuw proberen niet helpt.
export type DeleteRecipeResult = { ok: true } | { ok: false; error: string };

// We maken eerst de actieve-versie-koppeling los, zodat de FK Recipe.activeVersionId
// het cascaderen niet blokkeert.
export async function deleteRecipe(input: { recipeId: string }): Promise<DeleteRecipeResult> {
  const { locationId } = await getTenant();
  const { recipeId } = z.object({ recipeId: z.string().min(1) }).parse(input);

  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, locationId },
    select: { id: true },
  });
  if (!recipe) return { ok: false, error: "Recept niet gevonden in deze locatie." };

  // Beschermd: een recept dat elders als component wordt gebruikt, mag niet zomaar
  // verdwijnen (dat zou de kostprijs van het parent-gerecht stilletjes breken).
  const usedIn = await prisma.recipeComponent.findMany({
    where: { childRecipeId: recipeId },
    select: { parentVersion: { select: { recipe: { select: { dish: true } } } } },
  });
  if (usedIn.length > 0) {
    const dishes = Array.from(new Set(usedIn.map((u) => u.parentVersion.recipe.dish)));
    return { ok: false, error: `Kan niet verwijderen: wordt gebruikt als component in ${dishes.join(", ")}.` };
  }

  try {
    await prisma.$transaction([
      prisma.recipe.update({ where: { id: recipeId }, data: { activeVersionId: null } }),
      prisma.recipe.delete({ where: { id: recipeId } }),
    ]);
  } catch (err) {
    const code = (err as { code?: string }).code;
    console.error(JSON.stringify({ at: "library.deleteRecipe", code: code ?? null, locationId, recipeId }), err);
    return { ok: false, error: "Verwijderen is mislukt. Probeer het later opnieuw." };
  }

  revalidatePath("/library");
  revalidatePath("/lab");
  revalidatePath("/matrix");
  return { ok: true };
}
