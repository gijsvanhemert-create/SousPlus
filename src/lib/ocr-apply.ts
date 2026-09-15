import type { InvoiceLine } from "@/server/ocr";

// Client-side correctielogica voor de Factuur Scan: een herkende regel wordt een
// bewerkbare regel (prijs aanpasbaar, in-/uitsluiten) vóór de gebruiker de
// voorraadprijzen bijwerkt. Zuiver en los getest, zodat de data-mutatie op
// gecontroleerde invoer leunt.

export type EditableLine = InvoiceLine & {
  // Meedoen bij "Werk voorraadprijzen bij". Standaard aan voor gekoppelde regels.
  include: boolean;
};

// Parseert een door de gebruiker ingetikte prijs (NL-komma of punt) naar een
// niet-negatief getal, of null bij ongeldige/lege invoer.
export function parsePrice(input: string): number | null {
  const norm = input.trim().replace(",", ".");
  if (norm === "") return null;
  const n = Number(norm);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export type ApplyLine = { matchedId: string; keyword: string | null; unitPrice: number };

// Bouwt de payload voor applyInvoiceAction: alleen gekoppelde én ingesloten regels
// tellen mee; de (mogelijk gecorrigeerde) unitPrice wordt doorgegeven.
export function toApplyPayload(rows: EditableLine[]): ApplyLine[] {
  return rows
    .filter((r) => r.matchedId != null && r.include)
    .map((r) => ({ matchedId: r.matchedId as string, keyword: r.keyword, unitPrice: r.unitPrice }));
}
