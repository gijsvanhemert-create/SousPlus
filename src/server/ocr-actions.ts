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
