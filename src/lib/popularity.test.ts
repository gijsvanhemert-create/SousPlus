import { describe, it, expect } from "vitest";
import { popularityFreshness, AGING_AFTER_DAYS, STALE_AFTER_DAYS } from "@/lib/popularity";

const NOW = new Date("2026-09-17T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

describe("popularityFreshness — oplopende verouderd-signalering", () => {
  it("geen tijdstempel = demo-/seed-data", () => {
    expect(popularityFreshness(null, NOW)).toBe("demo");
    expect(popularityFreshness("niet-een-datum", NOW)).toBe("demo");
  });

  it("recent = fresh (neutraal)", () => {
    expect(popularityFreshness(daysAgo(0), NOW)).toBe("fresh");
    expect(popularityFreshness(daysAgo(30), NOW)).toBe("fresh");
    expect(popularityFreshness(daysAgo(AGING_AFTER_DAYS - 1), NOW)).toBe("fresh");
  });

  it("~3–6 maanden = aging (zachte waarschuwing)", () => {
    expect(popularityFreshness(daysAgo(AGING_AFTER_DAYS), NOW)).toBe("aging");
    expect(popularityFreshness(daysAgo(120), NOW)).toBe("aging");
    expect(popularityFreshness(daysAgo(STALE_AFTER_DAYS - 1), NOW)).toBe("aging");
  });

  it("> ~6 maanden = stale (dringend)", () => {
    expect(popularityFreshness(daysAgo(STALE_AFTER_DAYS), NOW)).toBe("stale");
    expect(popularityFreshness(daysAgo(400), NOW)).toBe("stale");
  });
});
