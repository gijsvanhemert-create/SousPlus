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

// Distinct categorieën van een locatie + de "Overig"-catch-all. Voor de
// categorie-keuze bij het toevoegen van een niet-gekoppelde OCR-regel aan de
// catalogus (lichter dan de volledige getCatalog).
export async function listCatalogCategories(locationId: string): Promise<string[]> {
  const rows = await prisma.catalogItem.findMany({
    where: { locationId },
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });
  const set = new Set(rows.map((r) => r.category));
  set.add("Overig");
  return Array.from(set).sort((a, b) => a.localeCompare(b, "nl"));
}

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
