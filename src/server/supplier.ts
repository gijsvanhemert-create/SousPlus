import { prisma } from "@/server/db";

// Supplier Portal-data. We volgen een set kernartikelen die de marge bepalen.
// Nu gesimuleerd; in productie vervangen door echte Hanos/Sligro-feeds (adapter
// per leverancier). De prijshistorie loopt al via IngredientPrice.

// Kernartikelen (zoekterm → het wordt gematcht op het goedkoopste catalogusitem).
export const TRACKED_KEYWORDS = ["zalm", "boter", "mirin", "rijst", "sesam", "miso"];

export type SupplierLine = {
  id: string;
  keyword: string;
  name: string;
  supplier: "HANOS" | "SLIGRO" | "BEIDE";
  unit: string;
  price: number;
};

export async function getSupplierLines(locationId: string): Promise<SupplierLine[]> {
  const lines: SupplierLine[] = [];
  const seen = new Set<string>();
  for (const keyword of TRACKED_KEYWORDS) {
    const item = await prisma.catalogItem.findFirst({
      where: { locationId, name: { contains: keyword, mode: "insensitive" } },
      orderBy: { price: "asc" },
    });
    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      lines.push({
        id: item.id,
        keyword,
        name: item.name,
        supplier: item.supplier,
        unit: item.unit,
        price: Number(item.price),
      });
    }
  }
  return lines;
}
