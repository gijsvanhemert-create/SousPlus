"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { getTenant } from "@/server/tenant";
import { getSupplierLines, type SupplierLine } from "./supplier";
import { evaluateMarginAlerts, type PriceChange } from "./watchdog";

// Gesimuleerde "Force Live API Re-Sync": elke kernprijs fluctueert ±3%, wordt
// vastgelegd in de prijshistorie (IngredientPrice) en doorgerekend in de
// receptuur-snapshots — zodat de marge live meebeweegt. De eerste sync zet de
// roomboter bewust +14% (zoals het prototype) zodat de Marge-Waakhond afgaat.
export async function reSyncPrices(): Promise<{ lines: SupplierLine[] }> {
  const { locationId } = await getTenant();
  const lines = await getSupplierLines(locationId);

  const priorSyncs = await prisma.ingredientPrice.count({
    where: { source: "feed:sim", item: { locationId } },
  });
  const firstSync = priorSyncs === 0;

  const updated: SupplierLine[] = [];
  const changes: PriceChange[] = [];

  for (const line of lines) {
    // Eerste sync = de boter-schok (+14%), rest stabiel zodat de Marge-Waakhond
    // betrouwbaar afgaat; daarna fluctueert alles ±3% (echte marktbeweging).
    const factor = firstSync ? (line.keyword === "boter" ? 1.14 : 1) : 1 + (Math.random() * 0.06 - 0.03);
    const newPrice = (line.price * factor).toFixed(2);

    await prisma.$transaction([
      prisma.catalogItem.update({ where: { id: line.id }, data: { price: newPrice } }),
      prisma.ingredientPrice.create({ data: { catalogItemId: line.id, price: newPrice, source: "feed:sim" } }),
      prisma.recipeIngredient.updateMany({
        where: { name: { contains: line.keyword, mode: "insensitive" }, version: { recipe: { locationId } } },
        data: { pricePerUnit: newPrice },
      }),
    ]);

    updated.push({ ...line, price: Number(newPrice) });
    changes.push({ keyword: line.keyword, name: line.name, oldPrice: line.price, newPrice: Number(newPrice) });
  }

  await evaluateMarginAlerts(locationId, changes);

  revalidatePath("/supplier");
  return { lines: updated };
}
