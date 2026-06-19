import { prisma } from "@/server/db";
import { getRouter } from "@/server/llm/router";

// Factuur Scan (OCR) — Tier 1 van de Intelligent Router (volume/goedkoop).
// De ruwe factuurtekst wordt server-side geëxtraheerd naar gestructureerde
// regels en gekoppeld aan catalogusartikelen. Nu tekst-paste; in productie een
// echt visie-/OCR-model op beeld/PDF. Het LLM wordt nooit vanuit de browser
// aangeroepen.

export const OCR_SYSTEM =
  "Je bent de OCR-extractielaag van SousPlus+. Je krijgt ruwe factuurtekst en geeft UITSLUITEND geldige JSON terug: " +
  'een array [{"name":string,"qty":number,"unit":string,"unitPrice":number,"total":number}]. ' +
  "Gebruik punten als decimaalteken. Geen uitleg, alleen de JSON-array.";

export type InvoiceLine = {
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  total: number;
  matchedId: string | null;
  matchedName: string | null;
  keyword: string | null;
};

function keywordOf(name: string): string | null {
  const words = name.toLowerCase().replace(/[^a-zà-ÿ\s]/gi, " ").split(/\s+/).filter((w) => w.length > 3);
  return words[0] ?? null;
}

export async function scanInvoice(text: string, locationId: string): Promise<InvoiceLine[]> {
  const router = getRouter();
  const res = await router.run(
    "tier1",
    { system: OCR_SYSTEM, messages: [{ role: "user", content: text }], maxTokens: 1200 },
    { locationId },
  );

  const raw = res.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("")
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const lines: InvoiceLine[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const name = String(o.name ?? "").trim();
    if (!name) continue;
    const keyword = keywordOf(name);
    const match = keyword
      ? await prisma.catalogItem.findFirst({
          where: { locationId, name: { contains: keyword, mode: "insensitive" } },
          orderBy: { price: "asc" },
          select: { id: true, name: true },
        })
      : null;
    lines.push({
      name,
      qty: Number(o.qty) || 0,
      unit: String(o.unit ?? ""),
      unitPrice: Number(o.unitPrice) || 0,
      total: Number(o.total) || 0,
      matchedId: match?.id ?? null,
      matchedName: match?.name ?? null,
      keyword,
    });
  }
  return lines;
}
