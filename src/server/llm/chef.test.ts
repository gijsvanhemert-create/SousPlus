import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import { buildMenuContext, buildFlavorContext, type CtxRecipe } from "./chef";
import type { VersionCost } from "@/lib/component-cost";

// Kostenkaart zoals getVersionCostMap die levert (component-inclusief).
function costMap(entries: Record<string, string>): Map<string, VersionCost> {
  return new Map(
    Object.entries(entries).map(([id, fc]) => [
      id,
      { foodcostPerServing: new Decimal(fc), unitCost: new Decimal(fc) },
    ]),
  );
}

// Regressie: eerder bevatte de APP-CONTEXT geen enkel id, waardoor Chef Auguste
// update_recipe_version/save_recipe_version niet gericht kon aanroepen en een id
// gokte dat nooit matchte ("versie niet gevonden"). De context moet de echte
// recipeId, activeVersion.id en versions[].id blootleggen.

const salmon: CtxRecipe = {
  id: "rec_salmon",
  dish: "Miso-Glazed Salmon",
  category: "Vis",
  menuPrice: "28.00",
  popularity: 40,
  activeVersion: {
    id: "ver_salmon_v12",
    label: "v1.2",
    name: "Witte Miso",
    ingredients: [
      { name: "Zalmfilet", amount: "150", unit: "g", mode: "WEIGHT", pricePerUnit: "24.00" },
    ],
  },
  versions: [
    { id: "ver_salmon_v11", label: "v1.1", name: "Rode Miso" },
    { id: "ver_salmon_v12", label: "v1.2", name: "Witte Miso" },
  ],
};

describe("buildMenuContext", () => {
  it("legt de echte id's bloot zodat het model versies gericht kan aanspreken", () => {
    const [item] = buildMenuContext([salmon], costMap({ ver_salmon_v12: "3.6" }));
    expect(item.recipeId).toBe("rec_salmon");
    expect(item.activeVersion?.id).toBe("ver_salmon_v12");
    expect(item.versions.map((v) => v.id)).toEqual(["ver_salmon_v11", "ver_salmon_v12"]);
  });

  it("neemt foodcost/marge over uit de kostenkaart (dezelfde als Lab/Library)", () => {
    const [item] = buildMenuContext([salmon], costMap({ ver_salmon_v12: "3.6" }));
    expect(item.foodcostPerCover).toBeCloseTo(3.6, 2);
    // (28 − 3,6) / 28 × 100 = 87,1%.
    expect(item.marginPct).toBe(87.1);
  });

  it("rekent component-kosten mee: gebruikt de (hogere) foodcost uit de map, niet ingrediënt-only", () => {
    // Ingrediënt-only zou €3,60 zijn; met een component in de map is het €5,00.
    const [item] = buildMenuContext([salmon], costMap({ ver_salmon_v12: "5.00" }));
    expect(item.foodcostPerCover).toBe(5);
    expect(item.marginPct).toBe(82.1); // (28 − 5)/28 × 100
  });

  it("geeft null-marge en een lege versielijst voor een recept zonder versies", () => {
    const leeg: CtxRecipe = { ...salmon, activeVersion: null, versions: [] };
    const [item] = buildMenuContext([leeg], new Map());
    expect(item.activeVersion).toBeNull();
    expect(item.marginPct).toBeNull();
    expect(item.versions).toEqual([]);
  });
});

describe("buildFlavorContext", () => {
  it("legt de gecureerde affinity-set met scores bloot als bron van waarheid", () => {
    const flavor = buildFlavorContext();
    // Gecureerde ingrediënten hebben een echte score → mag als data gepresenteerd.
    expect(flavor.curatedIngredients).toEqual(expect.arrayContaining(["salmon", "tomato", "beef"]));
    const misoMatch = flavor.pairings.salmon.find((p) => p.name === "Witte Miso");
    expect(misoMatch?.score).toBe(96);
  });

  it("bevat NIET-gecureerde ingrediënten niet, zodat het model zijn eigen kennis moet inzetten", () => {
    const flavor = buildFlavorContext();
    // Eendenlever staat niet in de set; miso is alleen een pairing (geen basis-key).
    expect(flavor.curatedIngredients).not.toContain("eendenlever");
    expect(flavor.curatedIngredients).not.toContain("foie gras");
    expect(flavor.curatedIngredients).not.toContain("miso");
    // Voor deze ingrediënten bestaat er dus geen affinity-score in de data.
    expect(flavor.pairings["eendenlever"]).toBeUndefined();
  });
});
