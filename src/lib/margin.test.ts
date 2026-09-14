import { describe, it, expect } from "vitest";
import { isMarginCriticalPct, marginTextClass, marginChipClass } from "@/lib/margin";

describe("marge-styling", () => {
  it("n.v.t. (null) is nooit kritiek en krijgt een neutrale kleur", () => {
    expect(isMarginCriticalPct(null)).toBe(false);
    expect(marginTextClass(null)).toBe("text-muted");
    expect(marginChipClass(null)).toBe("bg-canvas text-muted");
  });

  it("marge onder de grens is kritiek (rood)", () => {
    expect(isMarginCriticalPct(65)).toBe(true);
    expect(marginTextClass(65)).toBe("text-danger");
    expect(marginChipClass(65)).toBe("bg-danger-soft text-danger");
  });

  it("marge op of boven de grens is gezond (groen)", () => {
    expect(isMarginCriticalPct(70)).toBe(false);
    expect(marginTextClass(72)).toBe("text-success");
    expect(marginChipClass(72)).toBe("bg-success-soft text-success");
  });
});
