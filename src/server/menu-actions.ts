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
