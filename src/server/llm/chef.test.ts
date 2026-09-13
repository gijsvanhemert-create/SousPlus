import { describe, it, expect } from "vitest";
import { buildMenuContext, type CtxRecipe } from "./chef";

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
    const [item] = buildMenuContext([salmon]);
    expect(item.recipeId).toBe("rec_salmon");
    expect(item.activeVersion?.id).toBe("ver_salmon_v12");
    expect(item.versions.map((v) => v.id)).toEqual(["ver_salmon_v11", "ver_salmon_v12"]);
  });

  it("berekent marge/foodcost uit de actieve versie", () => {
    const [item] = buildMenuContext([salmon]);
    // (150/1000) * 24 = 3,60 foodcost per couvert.
    expect(item.foodcostPerCover).toBeCloseTo(3.6, 2);
    expect(item.marginPct).not.toBeNull();
  });

  it("geeft null-marge en een lege versielijst voor een recept zonder versies", () => {
    const leeg: CtxRecipe = { ...salmon, activeVersion: null, versions: [] };
    const [item] = buildMenuContext([leeg]);
    expect(item.activeVersion).toBeNull();
    expect(item.marginPct).toBeNull();
    expect(item.versions).toEqual([]);
  });
});
