import { prisma } from "@/server/db";
import type { CostMode } from "@/lib/cost";
import type { LabRecipe } from "@/types/recipe";

// Data-access voor de Recipe Lab. Altijd gescopet op locationId (multi-tenant).
// Prisma-Decimals worden naar string geserialiseerd zodat ze de server→client-
// grens verliesvrij overleven en de kostenmotor er exact mee kan rekenen.

export async function getLabRecipes(locationId: string): Promise<LabRecipe[]> {
  const recipes = await prisma.recipe.findMany({
    where: { locationId },
    orderBy: [{ favorite: "desc" }, { dish: "asc" }],
    include: {
      versions: {
        orderBy: { createdAt: "asc" },
        include: {
          ingredients: { orderBy: { id: "asc" } },
          components: {
            orderBy: { createdAt: "asc" },
            include: {
              childRecipe: { select: { dish: true, activeVersionId: true } },
              childVersion: { select: { label: true } },
            },
          },
        },
      },
    },
  });

  return recipes.map((r) => ({
    id: r.id,
    dish: r.dish,
    category: r.category,
    menuPrice: r.menuPrice.toString(),
    popularity: r.popularity,
    favorite: r.favorite,
    isOnMenu: r.isOnMenu,
    componentOnly: r.componentOnly,
    activeVersionId: r.activeVersionId,
    versions: r.versions.map((v) => ({
      id: v.id,
      label: v.label,
      name: v.name,
      note: v.note,
      prepTimeMin: v.prepTimeMin,
      steps: v.steps,
      yieldQty: v.yieldQty.toString(),
      yieldUnit: v.yieldUnit,
      yieldMode: v.yieldMode as CostMode,
      ingredients: v.ingredients.map((i) => ({
        id: i.id,
        catalogItemId: i.catalogItemId,
        name: i.name,
        amount: i.amount.toString(),
        unit: i.unit,
        mode: i.mode as CostMode,
        pricePerUnit: i.pricePerUnit === null ? null : i.pricePerUnit.toString(),
      })),
      components: v.components.map((c) => ({
        id: c.id,
        childRecipeId: c.childRecipeId,
        childVersionId: c.childVersionId,
        name: c.childRecipe.dish,
        versionLabel: c.childVersion.label,
        childActiveVersionId: c.childRecipe.activeVersionId,
        amount: c.amount.toString(),
        unit: c.unit,
        mode: c.mode as CostMode,
      })),
    })),
  }));
}
