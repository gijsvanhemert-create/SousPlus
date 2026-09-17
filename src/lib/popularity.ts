// Verouderd-signalering voor de handmatig ingevoerde populariteit (couverts per
// maand) in de Menu Matrix. Bewust een OPLOPENDE waarschuwing i.p.v. aan/uit:
//   - "demo"  : geen tijdstempel (seed-/demo-data, nog nooit handmatig ingevuld)
//   - "fresh" : recent (< ~3 maanden) — neutraal
//   - "aging" : ~3–6 maanden oud — zachte waarschuwing
//   - "stale" : > ~6 maanden oud — dringende waarschuwing
// Zo blijft zichtbaar dat deze cijfers handmatig zijn en veroudering geleidelijk
// zwaarder weegt, zonder te doen alsof het live kassadata is.

export type PopularityFreshness = "demo" | "fresh" | "aging" | "stale";

const DAY_MS = 24 * 60 * 60 * 1000;
export const AGING_AFTER_DAYS = 91; // ~3 maanden
export const STALE_AFTER_DAYS = 182; // ~6 maanden

export function popularityFreshness(
  updatedAtIso: string | null,
  now: Date = new Date(),
): PopularityFreshness {
  if (!updatedAtIso) return "demo";
  const updated = new Date(updatedAtIso).getTime();
  if (Number.isNaN(updated)) return "demo";
  const ageDays = (now.getTime() - updated) / DAY_MS;
  if (ageDays >= STALE_AFTER_DAYS) return "stale";
  if (ageDays >= AGING_AFTER_DAYS) return "aging";
  return "fresh";
}
