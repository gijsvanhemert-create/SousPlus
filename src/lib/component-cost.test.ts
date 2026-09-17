import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import { computeVersionCosts, unitCostFor, isVersionPriceComplete, MAX_COMPONENT_DEPTH, type CostVersionNode } from "@/lib/component-cost";

function expectDecimal(actual: Decimal | undefined, expected: string) {
  expect(actual?.toString()).toBe(new Decimal(expected).toString());
}

// Pepersaus: 1 ingrediënt (100 g peperkorrels @ €12/kg = €1,20 per portie),
// yield 50 ml ⇒ unitCost = 1,20 / 50 = €0,024 per ml.
const pepersaus: CostVersionNode = {
  id: "ver_saus",
  yieldQty: 50,
  ingredients: [{ name: "Peperkorrels", amount: 100, mode: "WEIGHT", pricePerUnit: "12.00" }],
  components: [],
};

describe("computeVersionCosts", () => {
  it("berekent foodcost/portie en unitCost van een los recept (yield-deling)", () => {
    const costs = computeVersionCosts([pepersaus]);
    expectDecimal(costs.get("ver_saus")?.foodcostPerServing, "1.2");
    expectDecimal(costs.get("ver_saus")?.unitCost, "0.024");
  });

  it("telt een WEIGHT-component door naar de parent (50 ml en 30 ml)", () => {
    const parent50: CostVersionNode = {
      id: "ver_steak",
      yieldQty: 1,
      ingredients: [],
      components: [{ childVersionId: "ver_saus", amount: 50 }],
    };
    const parent30: CostVersionNode = { ...parent50, id: "ver_steak30", components: [{ childVersionId: "ver_saus", amount: 30 }] };
    const costs = computeVersionCosts([pepersaus, parent50, parent30]);
    expectDecimal(costs.get("ver_steak")?.foodcostPerServing, "1.2"); // 50 × 0,024
    expectDecimal(costs.get("ver_steak30")?.foodcostPerServing, "0.72"); // 30 × 0,024
  });

  it("een PIECE-component (yield 1 portie) telt als 1× foodcost", () => {
    const garnituur: CostVersionNode = {
      id: "ver_garnituur",
      yieldQty: 1,
      ingredients: [{ name: "Kruidenolie", amount: 5, mode: "WEIGHT", pricePerUnit: "20.00" }], // 0,10
      components: [],
    };
    const parent: CostVersionNode = {
      id: "ver_bord",
      yieldQty: 1,
      ingredients: [],
      components: [{ childVersionId: "ver_garnituur", amount: 1 }],
    };
    const costs = computeVersionCosts([garnituur, parent]);
    expectDecimal(costs.get("ver_bord")?.foodcostPerServing, "0.1");
  });

  it("rekent geneste componenten (A→B→C) correct door", () => {
    // C: 200 g @ €5/kg = €1,00, yield 100 ml ⇒ 0,01/ml
    const c: CostVersionNode = { id: "C", yieldQty: 100, ingredients: [{ name: "c", amount: 200, mode: "WEIGHT", pricePerUnit: "5.00" }], components: [] };
    // B: gebruikt 50 ml van C = 0,50; yield 1 portie ⇒ 0,50/portie
    const b: CostVersionNode = { id: "B", yieldQty: 1, ingredients: [], components: [{ childVersionId: "C", amount: 50 }] };
    // A: gebruikt 2 porties van B = 1,00
    const a: CostVersionNode = { id: "A", yieldQty: 1, ingredients: [], components: [{ childVersionId: "B", amount: 2 }] };
    const costs = computeVersionCosts([a, b, c]);
    expectDecimal(costs.get("C")?.foodcostPerServing, "1");
    expectDecimal(costs.get("B")?.foodcostPerServing, "0.5");
    expectDecimal(costs.get("A")?.foodcostPerServing, "1");
  });

  it("stopt netjes bij een cyclus (A→B→A) zonder oneindige recursie", () => {
    const a: CostVersionNode = { id: "A", yieldQty: 1, ingredients: [{ name: "a", amount: 10, mode: "WEIGHT", pricePerUnit: "10.00" }], components: [{ childVersionId: "B", amount: 1 }] };
    const b: CostVersionNode = { id: "B", yieldQty: 1, ingredients: [{ name: "b", amount: 10, mode: "WEIGHT", pricePerUnit: "10.00" }], components: [{ childVersionId: "A", amount: 1 }] };
    const costs = computeVersionCosts([a, b]);
    // Geen crash; eindige, gedefinieerde waarden (de cycle-tak draagt 0 bij).
    expect(costs.get("A")?.foodcostPerServing.isFinite()).toBe(true);
    expect(costs.get("B")?.foodcostPerServing.isFinite()).toBe(true);
  });

  it("respecteert de diepte-cap", () => {
    // Ketting langer dan MAX_COMPONENT_DEPTH; de diepste schakels dragen 0 bij.
    const nodes: CostVersionNode[] = [];
    const len = MAX_COMPONENT_DEPTH + 3;
    for (let i = 0; i < len; i++) {
      nodes.push({
        id: `n${i}`,
        yieldQty: 1,
        ingredients: [{ name: `i${i}`, amount: 100, mode: "WEIGHT", pricePerUnit: "10.00" }], // €1,00 elk
        components: i < len - 1 ? [{ childVersionId: `n${i + 1}`, amount: 1 }] : [],
      });
    }
    const costs = computeVersionCosts(nodes);
    // Niet oneindig, en begrensd door de eigen laag + de toegestane diepte.
    expect(costs.get("n0")?.foodcostPerServing.isFinite()).toBe(true);
    expect(costs.get("n0")?.foodcostPerServing.lte(new Decimal(len))).toBe(true);
  });

  it("negeert een ontbrekende kind-versie (draagt 0 bij)", () => {
    const parent: CostVersionNode = { id: "P", yieldQty: 1, ingredients: [{ name: "x", amount: 100, mode: "WEIGHT", pricePerUnit: "10.00" }], components: [{ childVersionId: "onbekend", amount: 999 }] };
    const costs = computeVersionCosts([parent]);
    expectDecimal(costs.get("P")?.foodcostPerServing, "1"); // alleen het eigen ingrediënt
  });

  it("past prijs-overrides toe binnen de recursie (Marge-Waakhond)", () => {
    const saus: CostVersionNode = { id: "S", yieldQty: 50, ingredients: [{ catalogItemId: "peper", name: "Peper", amount: 100, mode: "WEIGHT", pricePerUnit: "12.00" }], components: [] };
    const parent: CostVersionNode = { id: "P", yieldQty: 1, ingredients: [], components: [{ childVersionId: "S", amount: 50 }] };
    const costs = computeVersionCosts([saus, parent], { overrides: { peper: "24.00" } });
    // Prijs verdubbeld ⇒ saus €2,40, unitCost 0,048, parent 50 × 0,048 = €2,40.
    expectDecimal(costs.get("P")?.foodcostPerServing, "2.4");
  });

  it("unitCostFor geeft 0 voor een onbekende versie", () => {
    const costs = computeVersionCosts([pepersaus]);
    expectDecimal(unitCostFor(costs, "ver_saus"), "0.024");
    expectDecimal(unitCostFor(costs, "bestaat-niet"), "0");
  });
});

describe("prijs-onbekend propagatie (priceComplete)", () => {
  // Saus met één ongeprijsd ingrediënt (pricePerUnit null) naast een geprijsd.
  const sausOnbekend: CostVersionNode = {
    id: "ver_saus_x",
    yieldQty: 50,
    ingredients: [
      { name: "Peperkorrels", amount: 100, mode: "WEIGHT", pricePerUnit: "12.00" }, // 1,20
      { name: "Wilde tijm (nieuw)", amount: 5, mode: "WEIGHT", pricePerUnit: null }, // onbekend
    ],
    components: [],
  };

  it("markeert een versie met een ongeprijsd ingrediënt als niet-compleet", () => {
    const costs = computeVersionCosts([sausOnbekend]);
    expect(costs.get("ver_saus_x")?.priceComplete).toBe(false);
    // De ongeprijsde regel draagt 0 bij → het getal is PARTIEEL, niet te vertrouwen.
    expectDecimal(costs.get("ver_saus_x")?.foodcostPerServing, "1.2");
    expect(isVersionPriceComplete(costs, "ver_saus_x")).toBe(false);
  });

  it("propageert onvolledigheid transitief naar de parent (component zonder prijs)", () => {
    const parent: CostVersionNode = {
      id: "ver_parent",
      yieldQty: 1,
      ingredients: [{ name: "Biefstuk", amount: 200, mode: "WEIGHT", pricePerUnit: "30.00" }],
      components: [{ childVersionId: "ver_saus_x", amount: 50 }],
    };
    const costs = computeVersionCosts([sausOnbekend, parent]);
    // De parent heeft zelf alleen geprijsde ingrediënten, maar erft de
    // onvolledigheid van de sub-component.
    expect(costs.get("ver_parent")?.priceComplete).toBe(false);
    expect(isVersionPriceComplete(costs, "ver_parent")).toBe(false);
  });

  it("een volledig geprijsde graaf blijft compleet", () => {
    const costs = computeVersionCosts([pepersaus]);
    expect(costs.get("ver_saus")?.priceComplete).toBe(true);
    expect(isVersionPriceComplete(costs, "ver_saus")).toBe(true);
    // Onbekende versie → geen prijsprobleem, geldt als compleet.
    expect(isVersionPriceComplete(costs, "bestaat-niet")).toBe(true);
  });
});
