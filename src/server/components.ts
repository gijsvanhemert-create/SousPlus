import { prisma } from "@/server/db";
import { assertComponentAllowed } from "@/server/recipe-cost-graph";

// Gedeelde kern voor het koppelen van een component/sub-recept. Wordt gebruikt
// door zowel de UI-action (addComponent) als de tools van Chef Auguste, zodat
// beide exact dezelfde, gevalideerde logica draaien (assertComponentAllowed +
// create-transactie + auto-markering als alleen-component). Geen getTenant/
// revalidatePath hier — de caller regelt de sessie-herkomst en cache-revalidatie.

export type LinkComponentResult = { autoMarkedComponentOnly: boolean; dish: string };

/** Actieve versie-id van een recept (locatie-gescopet) — het aanhechtpunt voor een component. */
export async function activeVersionIdOf(locationId: string, recipeId: string): Promise<string> {
  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, locationId },
    select: { activeVersionId: true },
  });
  if (!recipe) throw new Error("Ouderrecept niet gevonden in deze locatie.");
  if (!recipe.activeVersionId) throw new Error("Ouderrecept heeft geen actieve versie om aan te koppelen.");
  return recipe.activeVersionId;
}

/**
 * Koppel een kind-recept als component aan een parent-receptversie: pint op de
 * actieve versie van het kind, valideert cyclus/diepte, en markeert het kind als
 * alleen-component (consistent met isOnMenu). Idempotent: al gekoppeld ⇒ undefined.
 */
export async function linkComponent(params: {
  locationId: string;
  parentVersionId: string;
  childRecipeId: string;
}): Promise<LinkComponentResult | undefined> {
  const { locationId, parentVersionId, childRecipeId } = params;

  const [parentVersion, child] = await Promise.all([
    prisma.recipeVersion.findFirst({
      where: { id: parentVersionId, recipe: { locationId } },
      select: { id: true, recipeId: true, components: { select: { childRecipeId: true } } },
    }),
    prisma.recipe.findFirst({
      where: { id: childRecipeId, locationId },
      select: {
        id: true,
        dish: true,
        componentOnly: true,
        activeVersion: { select: { id: true, yieldQty: true, yieldUnit: true, yieldMode: true } },
      },
    }),
  ]);
  if (!parentVersion) throw new Error("Receptversie niet gevonden in deze locatie.");
  if (!child?.activeVersion) throw new Error("Component-recept heeft geen actieve versie.");

  // Idempotent: geen dubbele component in dezelfde versie.
  if (parentVersion.components.some((c) => c.childRecipeId === childRecipeId)) {
    return;
  }

  await assertComponentAllowed(locationId, parentVersion.recipeId, childRecipeId);

  // Default: één volledige portie van het kind (amount = yieldQty), zelfde eenheid/mode.
  // Markeer het kind meteen als "alleen component" (en van de kaart) als het dat nog
  // niet is; blijft een terugzetbare default via de Lab-toggle.
  const autoMark = !child.componentOnly;
  await prisma.$transaction([
    prisma.recipeComponent.create({
      data: {
        parentVersionId,
        childRecipeId,
        childVersionId: child.activeVersion.id,
        amount: child.activeVersion.yieldQty.toString(),
        unit: child.activeVersion.yieldUnit,
        mode: child.activeVersion.yieldMode,
      },
    }),
    ...(autoMark
      ? [prisma.recipe.update({ where: { id: childRecipeId }, data: { componentOnly: true, isOnMenu: false } })]
      : []),
  ]);
  return { autoMarkedComponentOnly: autoMark, dish: child.dish };
}
