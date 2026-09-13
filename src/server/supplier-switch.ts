import { prisma } from "@/server/db";

// Gedeelde "wissel naar een goedkopere leverancier"-logica. Gebruikt door zowel
// de Chef Auguste-tool (switch_supplier) als de Marge-Waakhond. Locatie-gescopet.
// Zoekt het goedkoopste matchende catalogusartikel en rekent die prijs door in
// de receptuur-snapshots; legt de wijziging vast in de prijshistorie.

const eur = (n: number) => "€" + n.toFixed(2).replace(".", ",");

export type SwitchResult = {
  switched: boolean;
  message: string;
  newPrice?: number;
  detail?: string;
};

export async function switchSupplierFor(locationId: string, ingredient: string): Promise<SwitchResult> {
  const matches = await prisma.catalogItem.findMany({
    where: { locationId, name: { contains: ingredient, mode: "insensitive" } },
    orderBy: { price: "asc" },
  });
  if (matches.length === 0) {
    return { switched: false, message: `Geen catalogusartikel gevonden voor "${ingredient}".` };
  }

  const cheapest = matches[0];
  const current = matches[matches.length - 1];
  if (matches.length < 2 || Number(cheapest.price) >= Number(current.price)) {
    return { switched: false, message: `Geen goedkoper alternatief voor "${ingredient}" — de huidige prijs is al scherp.` };
  }

  const newPrice = cheapest.price.toString();
  await prisma.$transaction([
    prisma.ingredientPrice.create({ data: { catalogItemId: cheapest.id, price: newPrice, source: "switch" } }),
    prisma.recipeIngredient.updateMany({
      where: { name: { contains: ingredient, mode: "insensitive" }, version: { recipe: { locationId } } },
      data: { pricePerUnit: newPrice },
    }),
  ]);

  const detail = `${current.supplier} ${eur(Number(current.price))} → ${cheapest.supplier} ${eur(Number(cheapest.price))}/${cheapest.unit}`;
  return {
    switched: true,
    newPrice: Number(cheapest.price),
    detail,
    message: `Gewisseld naar ${cheapest.supplier} · ${cheapest.name} (${detail}). Marge beschermd.`,
  };
}
