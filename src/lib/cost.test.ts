import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import {
  CostIngredient,
  foodcost,
  ingredientCost,
  isMarginCritical,
  recipeCost,
  toDecimal,
} from "@/lib/cost";

/** Handige assertie: vergelijk een Decimal op exacte waarde (en niet-null). */
function expectDecimal(actual: Decimal | null, expected: string) {
  expect(actual).not.toBeNull();
  expect(actual!.equals(new Decimal(expected))).toBe(true);
}

// Miso-Glazed Salmon v1.2 (per couvert) — deterministische variant van het prototype.
const salmon: CostIngredient[] = [
  { catalogItemId: "salmon-fillet", name: "Zalmfilet", amount: 150, mode: "WEIGHT", pricePerUnit: "38.50" }, // 5.775
  { catalogItemId: "white-miso", name: "Witte miso", amount: 20, mode: "WEIGHT", pricePerUnit: "12.00" }, //   0.24
  { catalogItemId: "butter", name: "Roomboter", amount: 15, mode: "WEIGHT", pricePerUnit: "9.00" }, //         0.135
  { catalogItemId: "soy", name: "Sojasaus", amount: 10, mode: "WEIGHT", pricePerUnit: "4.00" }, //             0.04
  { catalogItemId: "lemon", name: "Citroen", amount: "0.25", mode: "PIECE", pricePerUnit: "0.60" }, //         0.15
];

describe("toDecimal", () => {
  it("accepteert number, string, Decimal en Prisma-achtige objecten", () => {
    expectDecimal(toDecimal(38.5), "38.5");
    expectDecimal(toDecimal("38.50"), "38.5");
    expectDecimal(toDecimal(new Decimal("38.5")), "38.5");
    // Prisma.Decimal is een ander decimal.js-build → via toString().
    expectDecimal(toDecimal({ toString: () => "38.50" }), "38.5");
  });
});

describe("ingredientCost", () => {
  it("WEIGHT: (amount / 1000) × prijs-per-kg", () => {
    expectDecimal(ingredientCost({ amount: 150, mode: "WEIGHT", pricePerUnit: "38.50" }), "5.775");
  });

  it("PIECE: amount × prijs-per-eenheid", () => {
    expectDecimal(ingredientCost({ amount: 2, mode: "PIECE", pricePerUnit: "0.60" }), "1.2");
  });

  it("past een prijs-override toe op basis van catalogItemId", () => {
    const ing: CostIngredient = { catalogItemId: "butter", amount: 15, mode: "WEIGHT", pricePerUnit: "9.00" };
    expectDecimal(ingredientCost(ing, { butter: "10.26" }), "0.1539");
    // Map werkt net zo goed als een plain object.
    expectDecimal(ingredientCost(ing, new Map([["butter", "10.26"]])), "0.1539");
    // Override zonder match laat de snapshotprijs intact.
    expectDecimal(ingredientCost(ing, { other: "99" }), "0.135");
  });
});

describe("foodcost", () => {
  it("sommeert WEIGHT + PIECE over de ingrediënten", () => {
    expectDecimal(foodcost(salmon), "6.34");
  });

  it("rekent verliesvrij (geen float-drift)", () => {
    const items: CostIngredient[] = [
      { amount: 100, mode: "WEIGHT", pricePerUnit: 1 }, // 0.1
      { amount: 100, mode: "WEIGHT", pricePerUnit: 1 }, // 0.1
      { amount: 100, mode: "WEIGHT", pricePerUnit: 1 }, // 0.1
    ];
    const fc = foodcost(items);
    expectDecimal(fc, "0.3");
    expect(fc.toString()).toBe("0.3"); // float zou 0.30000000000000004 geven
  });

  it("lege ingrediëntenlijst → 0", () => {
    expectDecimal(foodcost([]), "0");
  });

  it("één ongeprijsd ingrediënt maakt de hele foodcost onbekend (null, NOOIT €0)", () => {
    const items: CostIngredient[] = [
      { name: "Zalmfilet", amount: 150, mode: "WEIGHT", pricePerUnit: "38.50" },
      { name: "Nieuw kruid", amount: 5, mode: "WEIGHT", pricePerUnit: null }, // onbekend
    ];
    // Zou 5,775 zijn als de onbekende regel als 0 werd meegeteld — dat mag NIET.
    expect(foodcost(items)).toBeNull();
  });
});

describe("prijs onbekend (null pricePerUnit)", () => {
  it("ingredientCost geeft null i.p.v. een (te lage) waarde", () => {
    expect(ingredientCost({ name: "x", amount: 100, mode: "WEIGHT", pricePerUnit: null })).toBeNull();
  });

  it("een prijs-override maakt een onbekende prijs alsnog bekend", () => {
    const ing: CostIngredient = { catalogItemId: "butter", amount: 15, mode: "WEIGHT", pricePerUnit: null };
    // Zonder override: onbekend.
    expect(ingredientCost(ing)).toBeNull();
    // Met override op het catalogItemId: gewoon berekend.
    expectDecimal(ingredientCost(ing, { butter: "10.26" }), "0.1539");
  });

  it("recipeCost werpt bij een onvolledige foodcost (marge niet bepaalbaar)", () => {
    expect(() =>
      recipeCost({
        menuPrice: "22.80",
        ingredients: [{ name: "Nieuw kruid", amount: 5, mode: "WEIGHT", pricePerUnit: null }],
      }),
    ).toThrow(/onvolledig/i);
  });

  it("recipeCost werpt óók als een component-kost onbekend is", () => {
    expect(() =>
      recipeCost({
        menuPrice: "22.80",
        ingredients: salmon,
        components: [{ amount: 50, unitCost: null }],
      }),
    ).toThrow(/onvolledig/i);
  });
});

describe("recipeCost", () => {
  it("berekent foodcost, brutowinst en marge per couvert", () => {
    const cost = recipeCost({ menuPrice: "22.80", ingredients: salmon });
    expectDecimal(cost.foodcostPerCover, "6.34");
    expectDecimal(cost.grossProfitPerCover, "16.46");
    // (22.80 − 6.34) / 22.80 = 0.721929824…
    expect(cost.marginRatio.toDecimalPlaces(6).toString()).toBe("0.72193");
    expect(cost.marginPct.toDecimalPlaces(2).toString()).toBe("72.19");
    expect(cost.foodcostPct.toDecimalPlaces(2).toString()).toBe("27.81");
  });

  it("schaalt totalen mee met het aantal couverts", () => {
    const cost = recipeCost({ menuPrice: "22.80", ingredients: salmon }, { covers: 12 });
    expect(cost.covers).toBe(12);
    expectDecimal(cost.foodcostTotal, "76.08"); // 6.34 × 12
    expectDecimal(cost.revenueTotal, "273.60"); // 22.80 × 12
    expectDecimal(cost.grossProfitTotal, "197.52"); // 16.46 × 12
  });

  it("lege receptuur → marge 100%", () => {
    const cost = recipeCost({ menuPrice: "10.00", ingredients: [] });
    expectDecimal(cost.foodcostPerCover, "0");
    expectDecimal(cost.marginPct, "100");
  });

  it("accepteert string- en Prisma-achtige Decimal-invoer", () => {
    const cost = recipeCost({
      menuPrice: { toString: () => "22.80" },
      ingredients: [{ amount: "150", mode: "WEIGHT", pricePerUnit: { toString: () => "38.50" } }],
    });
    expectDecimal(cost.foodcostPerCover, "5.775");
  });

  it("weigert een menuprijs ≤ 0", () => {
    expect(() => recipeCost({ menuPrice: 0, ingredients: salmon })).toThrow(/menuPrice/);
    expect(() => recipeCost({ menuPrice: "-1", ingredients: salmon })).toThrow(/menuPrice/);
  });

  it("weigert een ongeldig aantal couverts", () => {
    expect(() => recipeCost({ menuPrice: "10", ingredients: [] }, { covers: 0 })).toThrow(/couverts/);
  });

  it("telt component-regels mee in de foodcost en marge", () => {
    // Component al geresolved tot unitCost €0,024/ml (zie component-cost); 50 ml = €1,20.
    const cost = recipeCost({
      menuPrice: "22.80",
      ingredients: salmon, // 6,34
      components: [{ amount: 50, unitCost: "0.024" }],
    });
    expectDecimal(cost.foodcostPerCover, "7.54"); // 6,34 + 1,20
    expect(cost.marginPct.toDecimalPlaces(2).toString()).toBe("66.93");
  });

  it("werkt zonder components (backwards compatible)", () => {
    const zonder = recipeCost({ menuPrice: "22.80", ingredients: salmon });
    const leeg = recipeCost({ menuPrice: "22.80", ingredients: salmon, components: [] });
    expectDecimal(zonder.foodcostPerCover, "6.34");
    expectDecimal(leeg.foodcostPerCover, "6.34");
  });
});

describe("Marge-Waakhond: herberekening bij prijswijziging", () => {
  it("verwerkt een leveranciersprijsstijging via overrides", () => {
    const base = recipeCost({ menuPrice: "22.80", ingredients: salmon });
    // Roomboter +14% → €9,00 wordt €10,26.
    const hiked = recipeCost(
      { menuPrice: "22.80", ingredients: salmon },
      { overrides: { butter: "10.26" } },
    );

    // Foodcost stijgt met exact +0,0189 per couvert (0,015 kg × €1,26).
    expectDecimal(hiked.foodcostPerCover, "6.3589");
    expectDecimal(hiked.foodcostPerCover.sub(base.foodcostPerCover), "0.0189");
    // Marge daalt door de prijsstijging.
    expect(hiked.marginPct.lt(base.marginPct)).toBe(true);
  });

  it("isMarginCritical detecteert het zakken onder de 70%-grens", () => {
    const recipe = {
      menuPrice: "10.00",
      ingredients: [{ catalogItemId: "butter", amount: 330, mode: "WEIGHT", pricePerUnit: "9.00" }] as CostIngredient[],
    };

    const base = recipeCost(recipe); // foodcost 2.97 → marge 70.3%
    expect(base.marginPct.toDecimalPlaces(1).toString()).toBe("70.3");
    expect(isMarginCritical(base)).toBe(false);

    const hiked = recipeCost(recipe, { overrides: { butter: "10.26" } }); // foodcost 3.3858 → 66.14%
    expect(hiked.marginPct.toDecimalPlaces(2).toString()).toBe("66.14");
    expect(isMarginCritical(hiked)).toBe(true);
  });

  it("respecteert een aangepaste drempel", () => {
    const cost = recipeCost({ menuPrice: "22.80", ingredients: salmon }); // ~72,2%
    expect(isMarginCritical(cost, 70)).toBe(false);
    expect(isMarginCritical(cost, 75)).toBe(true);
  });
});
