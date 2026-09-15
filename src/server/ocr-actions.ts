"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { getTenant } from "@/server/tenant";
import { scanInvoice, type InvoiceLine, type InvoiceSource } from "./ocr";
import { evaluateMarginAlerts, type PriceChange } from "./watchdog";

// Foto-/PDF-upload van een factuur. `data` is base64 (zonder data-URL-prefix).
// De grootte-limiet loopt gelijk op met serverActions.bodySizeLimit; base64 is
// ~4/3 van de binaire grootte, dus ~14M tekens ≈ ~10MB bestand.
const fileSchema = z.object({
  kind: z.enum(["image", "pdf"]),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  data: z.string().min(1).max(14_000_000),
});

export async function scanInvoiceFileAction(input: {
  kind: "image" | "pdf";
  mediaType: string;
  data: string;
}): Promise<{ lines: InvoiceLine[] }> {
  const tenant = await getTenant();
  const parsed = fileSchema.parse(input);
  const source: InvoiceSource =
    parsed.kind === "pdf"
      ? { kind: "pdf", data: parsed.data }
      : { kind: "image", mediaType: parsed.mediaType, data: parsed.data };
  const lines = await scanInvoice(source, tenant.locationId);
  return { lines };
}

// Nieuw catalogusartikel vanuit een niet-gekoppelde OCR-regel. Naam/prijs/eenheid
// komen uit de regel; categorie kiest de gebruiker (default "Overig"). Leverancier
// is onbekend op regelniveau, dus neutrale default BEIDE (later te verfijnen in de
// catalogus). Gescopet op de huidige locatie, net als bestaande artikelen.
const newItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  unit: z.string().trim().min(1).max(30),
  price: z.number().nonnegative(),
  category: z.string().trim().min(1).max(80),
  supplier: z.enum(["HANOS", "SLIGRO", "BEIDE"]).default("BEIDE"),
});

export async function addCatalogItemFromLineAction(input: {
  name: string;
  unit: string;
  price: number;
  category: string;
  supplier?: "HANOS" | "SLIGRO" | "BEIDE";
}): Promise<{ id: string; name: string; created: boolean }> {
  const { locationId } = await getTenant();
  const data = newItemSchema.parse(input);

  // Dup-check: bestaat er al een artikel met (case-insensitief) dezelfde naam op
  // deze locatie? Zo ja, geen duplicaat aanmaken maar het bestaande teruggeven.
  const existing = await prisma.catalogItem.findFirst({
    where: { locationId, name: { equals: data.name, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (existing) return { id: existing.id, name: existing.name, created: false };

  const price = data.price.toFixed(2);
  const created = await prisma.catalogItem.create({
    data: {
      locationId,
      name: data.name,
      category: data.category,
      supplier: data.supplier,
      unit: data.unit,
      price,
    },
    select: { id: true, name: true },
  });
  // Eerste prijspunt in de historie, herkenbaar als afkomstig uit een OCR-scan.
  await prisma.ingredientPrice.create({ data: { catalogItemId: created.id, price, source: "ocr:new" } });

  revalidatePath("/ocr");
  revalidatePath("/ingredients");
  return { id: created.id, name: created.name, created: true };
}

const applySchema = z.object({
  lines: z.array(
    z.object({
      matchedId: z.string(),
      keyword: z.string().nullable(),
      unitPrice: z.number().nonnegative(),
    }),
  ),
});

// Werk de voorraadprijzen bij vanuit de gekoppelde factuurregels: catalogusprijs
// + prijshistorie (source "ocr") + doorrekenen in de receptuur-snapshots.
export async function applyInvoiceAction(input: { lines: Array<{ matchedId: string; keyword: string | null; unitPrice: number }> }): Promise<{ applied: number }> {
  const { locationId } = await getTenant();
  const { lines } = applySchema.parse(input);

  let applied = 0;
  const changes: PriceChange[] = [];
  for (const line of lines) {
    const owned = await prisma.catalogItem.findFirst({
      where: { id: line.matchedId, locationId },
      select: { id: true, name: true, price: true },
    });
    if (!owned) continue;
    const price = line.unitPrice.toFixed(2);
    await prisma.$transaction([
      prisma.catalogItem.update({ where: { id: owned.id }, data: { price } }),
      prisma.ingredientPrice.create({ data: { catalogItemId: owned.id, price, source: "ocr" } }),
      ...(line.keyword
        ? [
            prisma.recipeIngredient.updateMany({
              where: { name: { contains: line.keyword, mode: "insensitive" }, version: { recipe: { locationId } } },
              data: { pricePerUnit: price },
            }),
          ]
        : []),
    ]);
    changes.push({ keyword: line.keyword ?? owned.name.toLowerCase(), name: owned.name, oldPrice: Number(owned.price), newPrice: line.unitPrice });
    applied += 1;
  }

  await evaluateMarginAlerts(locationId, changes);

  revalidatePath("/ocr");
  return { applied };
}
