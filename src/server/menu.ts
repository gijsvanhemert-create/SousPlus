import { prisma } from "@/server/db";
import { recipeCost, type CostMode } from "@/lib/cost";

// Menukaart-overzicht met live marge — gedeeld door Recipe Library en Menu Matrix.
// Marge komt uit de fase-2 kostenmotor over de actieve receptversie.

export type MenuItem = {
  id: string;
  dish: string;
  category: string;
  menuPrice: number;
  marginPct: number;
  foodcostPerCover: number;
  popularity: number;
  favorite: boolean;
  versionLabel: string | null;
};

export async function getMenuOverview(locationId: string): Promise<MenuItem[]> {
  const recipes = await prisma.recipe.findMany({
    where: { locationId },
    include: { activeVersion: { include: { ingredients: true } } },
    orderBy: [{ favorite: "desc" }, { dish: "asc" }],
  });

  return recipes.map((r) => {
    const v = r.activeVersion;
    const cost =
      v && v.ingredients.length > 0
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
      id: r.id,
      dish: r.dish,
      category: r.category,
      menuPrice: Number(r.menuPrice),
      marginPct: cost ? Number(cost.marginPct.toFixed(1)) : 0,
      foodcostPerCover: cost ? Number(cost.foodcostPerCover.toFixed(2)) : 0,
      popularity: r.popularity,
      favorite: r.favorite,
      versionLabel: v?.label ?? null,
    };
  });
}
