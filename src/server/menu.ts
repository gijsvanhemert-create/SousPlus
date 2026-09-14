import { prisma } from "@/server/db";
import { getVersionCostMap } from "@/server/recipe-cost-graph";

// Menukaart-overzicht met live marge — gedeeld door Recipe Library en Menu Matrix.
// Marge komt uit de kostenmotor over de actieve receptversie, inclusief de kosten
// van eventuele componenten/sub-recepten (via de recursieve resolver).

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
  const [recipes, costMap] = await Promise.all([
    prisma.recipe.findMany({
      where: { locationId },
      include: { activeVersion: { select: { id: true, label: true } } },
      orderBy: [{ favorite: "desc" }, { dish: "asc" }],
    }),
    getVersionCostMap(locationId),
  ]);

  return recipes.map((r) => {
    const v = r.activeVersion;
    // Foodcost/portie van de actieve versie (incl. componenten) uit de resolver.
    const foodcost = v ? costMap.get(v.id)?.foodcostPerServing ?? null : null;
    const price = Number(r.menuPrice);
    const fc = foodcost ? foodcost.toNumber() : null;
    // Marge alleen zinvol bij een positieve menuprijs (sub-recepten kunnen 0 zijn).
    const marginPct = fc !== null && price > 0 ? Number((((price - fc) / price) * 100).toFixed(1)) : 0;
    return {
      id: r.id,
      dish: r.dish,
      category: r.category,
      menuPrice: price,
      marginPct,
      foodcostPerCover: fc !== null ? Number(fc.toFixed(2)) : 0,
      popularity: r.popularity,
      favorite: r.favorite,
      versionLabel: v?.label ?? null,
    };
  });
}
