import { describe, it, expect } from "vitest";
import { parsePrice, toApplyPayload, type EditableLine } from "./ocr-apply";

function line(over: Partial<EditableLine>): EditableLine {
  return {
    name: "Zalmfilet vers",
    qty: 4.2,
    unit: "kg",
    unitPrice: 29.4,
    total: 123.48,
    matchedId: "cat-zalm",
    matchedName: "Zalmfilet MSC",
    keyword: "zalmfilet",
    include: true,
    ...over,
  };
}

describe("parsePrice", () => {
  it("accepteert komma en punt als decimaalteken", () => {
    expect(parsePrice("12,50")).toBe(12.5);
    expect(parsePrice("12.50")).toBe(12.5);
    expect(parsePrice(" 8 ")).toBe(8);
    expect(parsePrice("0")).toBe(0);
  });

  it("weigert lege, niet-numerieke en negatieve invoer", () => {
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("abc")).toBeNull();
    expect(parsePrice("-1")).toBeNull();
  });
});

describe("toApplyPayload", () => {
  it("neemt alleen gekoppelde én ingesloten regels mee, met gecorrigeerde prijs", () => {
    const rows: EditableLine[] = [
      line({ name: "Zalmfilet", unitPrice: 31.0 }), // gekoppeld + include → mee
      line({ name: "Roomboter", matchedId: "cat-boter", keyword: "roomboter", include: false }), // uitgesloten
      line({ name: "Onbekend product", matchedId: null, matchedName: null, keyword: "onbekend" }), // niet gekoppeld
    ];

    const payload = toApplyPayload(rows);

    expect(payload).toEqual([{ matchedId: "cat-zalm", keyword: "zalmfilet", unitPrice: 31.0 }]);
  });

  it("levert een lege payload wanneer niets ingesloten is", () => {
    expect(toApplyPayload([line({ include: false })])).toEqual([]);
    expect(toApplyPayload([line({ matchedId: null })])).toEqual([]);
  });
});
