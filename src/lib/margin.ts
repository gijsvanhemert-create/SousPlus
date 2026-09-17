// Gedeelde marge-styling zodat de kleurregel overal gelijk is. Een marge van
// `null` betekent "n.v.t." (geen zinvolle marge, bv. bij menuPrice 0 / sub-recept)
// en krijgt een NEUTRALE kleur — geen rood, want dat suggereert onterecht een
// kritieke marge.

export const MARGIN_CRITICAL_PCT = 70;

/**
 * Heeft een recept een zinvolle verkoopmarge? Nee voor alleen-component
 * (sub-)recepten — ongeacht welke menuPrice er toevallig is opgeslagen — en nee
 * zonder positieve menuprijs. Zulke recepten tonen "n.v.t." (neutraal).
 */
export function marginApplies(componentOnly: boolean, menuPrice: number): boolean {
  return !componentOnly && menuPrice > 0;
}

/**
 * Namen van ingrediënten zonder bekende prijs (`pricePerUnit === null`). Voedt de
 * "onvolledige kostprijs"-melding in de Recipe Lab, zodat de chef precies ziet
 * welke ingrediënten hij nog moet prijzen.
 */
export function unpricedNames(ingredients: { name: string; pricePerUnit: string | null }[]): string[] {
  return ingredients.filter((i) => i.pricePerUnit === null).map((i) => i.name);
}

/** Kritiek = er ís een marge én die ligt onder de grens. `null` is niet kritiek. */
export function isMarginCriticalPct(marginPct: number | null, threshold = MARGIN_CRITICAL_PCT): boolean {
  return marginPct != null && marginPct < threshold;
}

/** Tekstkleur-utility voor een marge-waarde (n.v.t. → neutraal grijs). */
export function marginTextClass(marginPct: number | null): string {
  if (marginPct == null) return "text-muted";
  return isMarginCriticalPct(marginPct) ? "text-danger" : "text-success";
}

/** Pill-classes (achtergrond + tekst) voor een marge-chip (n.v.t. → neutraal). */
export function marginChipClass(marginPct: number | null): string {
  if (marginPct == null) return "bg-canvas text-muted";
  return isMarginCriticalPct(marginPct) ? "bg-danger-soft text-danger" : "bg-success-soft text-success";
}
