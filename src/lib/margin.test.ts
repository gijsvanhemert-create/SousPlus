import { describe, it, expect } from "vitest";
import { isMarginCriticalPct, marginTextClass, marginChipClass, marginApplies, unpricedNames } from "@/lib/margin";

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

  it("marge is n.v.t. voor alleen-component recepten, ongeacht de menuprijs", () => {
    expect(marginApplies(true, 24.5)).toBe(false); // componentOnly met prijs → geen marge
    expect(marginApplies(true, 0)).toBe(false);
    expect(marginApplies(false, 0)).toBe(false); // geen prijs → geen marge
    expect(marginApplies(false, 24.5)).toBe(true); // normaal verkoopbaar gerecht
  });
});

describe("unpricedNames", () => {
  it("geeft de namen van ingrediënten zonder bekende prijs (pricePerUnit null)", () => {
    const ingredients = [
      { name: "Zalmfilet", pricePerUnit: "38.50" },
      { name: "Wilde daslook", pricePerUnit: null },
      { name: "Sjalot", pricePerUnit: "2.20" },
      { name: "Zeekraal", pricePerUnit: null },
    ];
    expect(unpricedNames(ingredients)).toEqual(["Wilde daslook", "Zeekraal"]);
  });

  it("geeft een lege lijst als alles geprijsd is", () => {
    expect(unpricedNames([{ name: "Zalmfilet", pricePerUnit: "38.50" }])).toEqual([]);
  });
});
