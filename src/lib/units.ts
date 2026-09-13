// Eenheidsnormalisatie voor receptingrediënten.
//
// Conventie (zie lib/cost.ts): voor WEIGHT is `amount` altijd gram/ml per
// couvert en is `pricePerUnit` de prijs per kg/L — de kostenmotor deelt door
// 1000. De catalogus-eenheid (kg/L) is dus alleen een prijsbasis en mag NOOIT
// als opslag-eenheid worden overgenomen, anders krijg je onzin als "80 kg per
// couvert". Daarom normaliseren we de unit naar "g" of "ml", ongeacht wat er
// wordt aangeleverd. De hoeveelheid zelf blijft ongemoeid: die is per contract
// al grammen/ml.

const VOLUME_UNITS = ["ml", "milliliter", "cc", "cl", "dl", "l", "lt", "ltr", "liter", "litre"];

/** Dwing een gewichts-/volume-eenheid af naar "g" (default) of "ml". */
export function normalizeWeightUnit(unit?: string): "g" | "ml" {
  const u = (unit ?? "").trim().toLowerCase().replace(/\.$/, "");
  return VOLUME_UNITS.includes(u) ? "ml" : "g";
}

/** True als deze WEIGHT-eenheid al genormaliseerd is (g/ml). */
export function isNormalizedWeightUnit(unit?: string): boolean {
  const u = (unit ?? "").trim().toLowerCase();
  return u === "g" || u === "ml";
}
