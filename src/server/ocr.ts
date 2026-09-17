import { prisma } from "@/server/db";
import { getRouter } from "@/server/llm/router";
import type { LlmResponse, UserContentBlock } from "@/server/llm/types";

// Factuur Scan (OCR) — Tier 1 van de Intelligent Router (volume/goedkoop).
// De factuur wordt server-side geëxtraheerd naar gestructureerde regels en
// gekoppeld aan catalogusartikelen. Invoer kan tekst, een foto (image) of een
// PDF zijn; vanaf een beeld/PDF gebruikt hetzelfde Tier 1-model (Claude vision)
// exact dezelfde extractie en matching. Het LLM wordt nooit vanuit de browser
// aangeroepen.

export const OCR_SYSTEM =
  "Je bent de OCR-extractielaag van SousPlus+. Je krijgt een leveranciersfactuur — als tekst, foto of PDF — en geeft UITSLUITEND geldige JSON terug: " +
  'een array [{"name":string,"qty":number,"unit":string,"unitPrice":number,"total":number}]. ' +
  "Gebruik punten als decimaalteken. Geen uitleg, alleen de JSON-array.";

// Taakinstructie die als tekstblok naast een foto/PDF meegaat (bij platte tekst
// is de tekst zelf al de opdracht).
const MEDIA_INSTRUCTION = "Lees de regels van deze factuur uit en geef de JSON-array terug.";

// Bron van een te scannen factuur. `data` is telkens base64.
export type InvoiceSource =
  | { kind: "text"; text: string }
  | { kind: "image"; mediaType: string; data: string }
  | { kind: "pdf"; data: string };

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

// Betekenisvolle woorden (>3 letters) uit een regelnaam, voor matching.
export function tokensOf(name: string): string[] {
  return name.toLowerCase().replace(/[^a-zà-ÿ\s]/gi, " ").split(/\s+/).filter((w) => w.length > 3);
}

// NB: het eerste betekenisvolle token (`tokens[0]`) blijft de sleutel voor de
// recept-prijsupdate (applyInvoiceAction gebruikt dit als `contains` op
// recipeIngredient) — vandaar dat we het als `keyword` op de regel bewaren.

export type Candidate = { id: string; name: string; price: number };

// Minimale score (som van lengtes van overlappende tokens) om als match te tellen.
// Zo telt een lós generiek woord als "vers" (4) niet mee — dat komt in tientallen
// artikelen voor — terwijl een specifiek woord als "zalmfilet" (9), of twee
// overlappende tokens, wél kwalificeert.
const MIN_MATCH_SCORE = 5;

// Kiest uit kandidaten het artikel met de sterkste token-overlap, gewogen naar
// tokenlengte (specifieker = zwaarder). Bij gelijke score wint de laagste prijs
// (zoals voorheen). Ruimer dan de oude "eerste-woord"-match zodat we minder
// duplicaten aanmaken, maar met een drempel tegen valse matches op generieke
// woorden. De gebruiker bevestigt elke koppeling nog steeds vóór een prijsupdate.
export function bestCandidate(tokens: string[], candidates: Candidate[]): Candidate | null {
  let best: Candidate | null = null;
  let bestScore = 0;
  let bestPrice = Infinity;
  for (const c of candidates) {
    const lower = c.name.toLowerCase();
    let score = 0;
    for (const t of tokens) if (lower.includes(t)) score += t.length;
    if (score < MIN_MATCH_SCORE) continue;
    if (score > bestScore || (score === bestScore && c.price < bestPrice)) {
      best = c;
      bestScore = score;
      bestPrice = c.price;
    }
  }
  return best;
}

// Bouwt de user-content voor de router-call op basis van de bron: platte tekst
// blijft een string (identiek aan de oude tekst-flow), beeld/PDF worden een
// content-block-array met het beeld gevolgd door de taakinstructie.
function userContentFor(source: InvoiceSource): string | UserContentBlock[] {
  switch (source.kind) {
    case "text":
      return source.text;
    case "image":
      return [
        { type: "image", source: { type: "base64", media_type: source.mediaType, data: source.data } },
        { type: "text", text: MEDIA_INSTRUCTION },
      ];
    case "pdf":
      return [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: source.data } },
        { type: "text", text: MEDIA_INSTRUCTION },
      ];
  }
}

// Haalt de platte JSON-tekst uit het modelantwoord (strip eventuele code-fences).
function extractJsonText(res: LlmResponse): string {
  return res.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("")
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
}

// Parseert de JSON-regels en koppelt elke regel aan een catalogusartikel via een
// keyword-match. Gedeeld door alle bronnen (tekst/foto/PDF) — hier zit de pariteit.
async function parseAndMatch(raw: string, locationId: string): Promise<InvoiceLine[]> {
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
    const tokens = tokensOf(name);
    const keyword = tokens[0] ?? null;
    let match: { id: string; name: string } | null = null;
    if (tokens.length > 0) {
      const candidates = await prisma.catalogItem.findMany({
        where: { locationId, OR: tokens.map((t) => ({ name: { contains: t, mode: "insensitive" } })) },
        select: { id: true, name: true, price: true },
      });
      match = bestCandidate(
        tokens,
        candidates.map((c) => ({ id: c.id, name: c.name, price: Number(c.price) })),
      );
    }
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

export async function scanInvoice(source: InvoiceSource, locationId: string): Promise<InvoiceLine[]> {
  const router = getRouter();
  const res = await router.run(
    "tier1",
    {
      system: OCR_SYSTEM,
      messages: [{ role: "user", content: userContentFor(source) }],
      // Meer regels = meer output. Een PDF kan meerdere pagina's beslaan, dus die
      // krijgt de ruimste limiet; een enkele foto minder, tekst het minst.
      maxTokens: source.kind === "text" ? 1200 : source.kind === "pdf" ? 4096 : 2048,
    },
    { locationId, action: `ocr:${source.kind}` },
  );

  return parseAndMatch(extractJsonText(res), locationId);
}
