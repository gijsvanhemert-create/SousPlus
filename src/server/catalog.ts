import { prisma } from "@/server/db";

// Catalogus-data voor de Ingrediëntencatalogus en het Supplier Portal.
// Gescopet op locationId. In productie gevoed door de live Hanos/Sligro-feed.

export type CatalogRow = {
  id: string;
  name: string;
  category: string;
  supplier: "HANOS" | "SLIGRO" | "BEIDE";
  unit: string;
  price: number;
};

export type CatalogOverview = {
  items: CatalogRow[];
  categories: string[];
  counts: { hanos: number; sligro: number; total: number };
};

export async function getCatalog(locationId: string): Promise<CatalogOverview> {
  const rows = await prisma.catalogItem.findMany({
    where: { locationId },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  const items: CatalogRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    supplier: r.supplier,
    unit: r.unit,
    price: Number(r.price),
  }));
  const categories = Array.from(new Set(items.map((i) => i.category))).sort();
  const hanos = items.filter((i) => i.supplier === "HANOS" || i.supplier === "BEIDE").length;
  const sligro = items.filter((i) => i.supplier === "SLIGRO" || i.supplier === "BEIDE").length;
  return { items, categories, counts: { hanos, sligro, total: items.length } };
}
