// Pure helpers voor de recept-OCR: het modelantwoord (JSON) parsen naar een veilig
// getypeerde structuur, en eenheden/porties normaliseren naar het app-datamodel.
// Geen DB- of netwerk-afhankelijkheden, dus los testbaar (net als lib/ocr-apply).

export type RawIngredient = {
  name: string;
  /** Hoeveelheid zoals uitgelezen; null als onleesbaar (nooit geraden). */
  qty: number | null;
  /** Eenheid zoals uitgelezen (g, kg, ml, el, stuk, …); null indien afwezig. */
  unit: string | null;
};

export type ParsedRecipe = {
  dish: string;
  category: string | null;
  /** Aantal personen indien vermeld ("voor 4 personen"); anders null. */
  serves: number | null;
  ingredients: RawIngredient[];
  steps: string[];
  /** Onleesbare/onzekere stukken die het model zelf markeert (voor de review). */
  warnings: string[];
};

function toNumberOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toPositiveIntOrNull(v: unknown): number | null {
  const n = toNumberOrNull(v);
  if (n == null) return null;
  const i = Math.trunc(n);
  return i > 0 ? i : null;
}

function cleanStrings(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((s): s is string => typeof s === "string" && s.trim() !== "").map((s) => s.trim());
}

/**
 * Parseert het (mogelijk in code-fences verpakte) modelantwoord naar een recept.
 * Geeft null als het geen bruikbaar object is of als er noch een naam noch
 * ingrediënten in zitten (dan is er niets zinvols geëxtraheerd).
 */
export function parseExtractedRecipe(raw: string): ParsedRecipe | null {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const o = parsed as Record<string, unknown>;

  const dish = typeof o.dish === "string" ? o.dish.trim() : "";
  const ingredients: RawIngredient[] = [];
  if (Array.isArray(o.ingredients)) {
    for (const it of o.ingredients) {
      if (!it || typeof it !== "object") continue;
      const r = it as Record<string, unknown>;
      const name = typeof r.name === "string" ? r.name.trim() : "";
      if (!name) continue;
      ingredients.push({
        name,
        qty: toNumberOrNull(r.qty),
        unit: typeof r.unit === "string" && r.unit.trim() ? r.unit.trim() : null,
      });
    }
  }

  if (!dish && ingredients.length === 0) return null;

  return {
    dish,
    category: typeof o.category === "string" && o.category.trim() ? o.category.trim() : null,
    serves: toPositiveIntOrNull(o.serves),
    ingredients,
    steps: cleanStrings(o.steps),
    warnings: cleanStrings(o.warnings),
  };
}

export type CostMode = "WEIGHT" | "PIECE";
export type StorageIngredient = { amount: number | null; unit: string; mode: CostMode };

// Massa → gram, volume → milliliter. Beide zijn WEIGHT (prijs per kg/L in de app).
const WEIGHT_FACTORS: Record<string, { factor: number; unit: "g" | "ml" }> = {
  g: { factor: 1, unit: "g" },
  gr: { factor: 1, unit: "g" },
  gram: { factor: 1, unit: "g" },
  grammen: { factor: 1, unit: "g" },
  kg: { factor: 1000, unit: "g" },
  kilo: { factor: 1000, unit: "g" },
  kilogram: { factor: 1000, unit: "g" },
  ml: { factor: 1, unit: "ml" },
  cl: { factor: 10, unit: "ml" },
  dl: { factor: 100, unit: "ml" },
  l: { factor: 1000, unit: "ml" },
  liter: { factor: 1000, unit: "ml" },
};

/**
 * Normaliseert een uitgelezen (qty, unit) naar het opslagmodel:
 *  - massa/volume → WEIGHT in g/ml (met kg→g, L→ml, cl/dl → ml);
 *  - al het andere (stuk, el, tl, teen, snufje, of leeg) → PIECE met de eenheid
 *    als label. `amount` blijft null als de hoeveelheid onleesbaar was.
 * De prijsbasis (per couvert / per persoon) wordt hier NIET toegepast — dat doet
 * de opslagstap met de door de chef gekozen porties (zie perCoverAmount).
 */
export function toStorageIngredient(ing: { qty: number | null; unit: string | null }): StorageIngredient {
  const key = (ing.unit ?? "").toLowerCase().trim();
  const weight = WEIGHT_FACTORS[key];
  if (weight) {
    return { amount: ing.qty == null ? null : ing.qty * weight.factor, unit: weight.unit, mode: "WEIGHT" };
  }
  return { amount: ing.qty, unit: key || "stuk", mode: "PIECE" };
}

/**
 * Rekent een hoeveelheid om naar per couvert. Als de hoeveelheden totaal voor
 * `serves` personen gelden, delen we door dat aantal; anders (per persoon) blijft
 * de waarde ongemoeid. Zo hoeft de chef niets zelf te herrekenen.
 */
export function perCoverAmount(
  amount: number | null,
  serves: number | null,
  basis: "per_person" | "total",
): number | null {
  if (amount == null) return null;
  if (basis === "total" && serves && serves > 0) return amount / serves;
  return amount;
}
