import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import { buildMenuContext, buildComponentContext, buildFlavorContext, buildSystem, type CtxRecipe, type CtxComponent } from "./chef";
import type { VersionCost } from "@/lib/component-cost";

// Kostenkaart zoals getVersionCostMap die levert (component-inclusief). Standaard
// volledig geprijsd; geef een id op in `incomplete` om die versie als onvolledig
// (ongeprijsd ingrediënt) te markeren — dan is `foodcostPerServing` een PARTIËLE
// waarde die niet als volledige kostprijs mag worden gebruikt.
function costMap(entries: Record<string, string>, incomplete: string[] = []): Map<string, VersionCost> {
  return new Map(
    Object.entries(entries).map(([id, fc]) => [
      id,
      { foodcostPerServing: new Decimal(fc), unitCost: new Decimal(fc), priceComplete: !incomplete.includes(id) },
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

  it("geeft GEEN (partieel) percentage bij een onvolledig geprijsd recept", () => {
    // De kostenkaart heeft een partiële foodcost (€1,50 over alleen de bekende
    // ingrediënten) maar priceComplete=false. buildMenuContext mag daar NOOIT een
    // schijnbaar-precies margegetal van maken — foodcost én marge worden null.
    const [item] = buildMenuContext([salmon], costMap({ ver_salmon_v12: "1.50" }, ["ver_salmon_v12"]));
    expect(item.foodcostComplete).toBe(false);
    expect(item.marginPct).toBeNull();
    expect(item.foodcostPerCover).toBeNull();
  });

  it("markeert een volledig geprijsd recept als foodcostComplete", () => {
    const [item] = buildMenuContext([salmon], costMap({ ver_salmon_v12: "3.6" }));
    expect(item.foodcostComplete).toBe(true);
    expect(item.marginPct).toBe(87.1);
  });

  it("geeft null-marge en een lege versielijst voor een recept zonder versies", () => {
    const leeg: CtxRecipe = { ...salmon, activeVersion: null, versions: [] };
    const [item] = buildMenuContext([leeg], new Map());
    expect(item.activeVersion).toBeNull();
    expect(item.marginPct).toBeNull();
    expect(item.versions).toEqual([]);
  });
});

const preiConfit: CtxComponent = {
  id: "rec_prei_confit",
  dish: "Prei Confit",
  category: "Component",
  activeVersion: { id: "ver_confit_v1", label: "v1.0", name: "Basis", steps: ["Confijt de prei in olie.", "Laat uitlekken."] },
  versions: [{ id: "ver_confit_v1", label: "v1.0", name: "Basis" }],
  usedIn: ["Prei du Soleil"],
};

describe("buildComponentContext", () => {
  it("legt id's + usedIn bloot zodat een component gericht bewerkbaar is", () => {
    const [c] = buildComponentContext([preiConfit]);
    expect(c.recipeId).toBe("rec_prei_confit");
    expect(c.dish).toBe("Prei Confit");
    expect(c.activeVersion?.id).toBe("ver_confit_v1");
    expect(c.versions.map((v) => v.id)).toEqual(["ver_confit_v1"]);
    expect(c.usedIn).toEqual(["Prei du Soleil"]);
  });

  it("geeft de huidige bereidingsstappen mee zodat een component bewerkbaar is zonder ze te verzinnen", () => {
    const [c] = buildComponentContext([preiConfit]);
    expect(c.activeVersion?.steps).toEqual(["Confijt de prei in olie.", "Laat uitlekken."]);
  });

  it("framet een component NIET als verkoopbaar gerecht: geen menuPrice/marge/foodcost", () => {
    const [c] = buildComponentContext([preiConfit]) as unknown as Record<string, unknown>[];
    expect(c.isComponent).toBe(true);
    // Cruciaal: velden die een 'verkoopbaar gerecht' suggereren mogen ontbreken,
    // zodat het model een component nooit in een margeanalyse meeneemt.
    expect(c).not.toHaveProperty("menuPrice");
    expect(c).not.toHaveProperty("marginPct");
    expect(c).not.toHaveProperty("foodcostPerCover");
    expect(c).not.toHaveProperty("popularity");
  });

  it("verdraagt een component zonder actieve versie", () => {
    const [c] = buildComponentContext([{ ...preiConfit, activeVersion: null }]);
    expect(c.activeVersion).toBeNull();
    expect(c.versions.map((v) => v.id)).toEqual(["ver_confit_v1"]);
  });
});

describe("buildSystem — prompt-cache-splitsing", () => {
  const context = { menu: [], alerts: [], flavor: {} };

  it("levert twee blokken: stabiel (met cache-breakpoint) + dynamische APP-CONTEXT", () => {
    const blocks = buildSystem(context);
    expect(blocks).toHaveLength(2);

    // Blok 0: het stabiele persona/tool-deel met cache=true, ZONDER de context.
    expect(blocks[0].cache).toBe(true);
    expect(blocks[0].text).toContain("Je bent Chef Auguste");
    expect(blocks[0].text).not.toContain("APP-CONTEXT (JSON)");

    // Blok 1: het dynamische deel met de context-JSON, ZONDER cache-breakpoint.
    expect(blocks[1].cache).toBeUndefined();
    expect(blocks[1].text).toContain("APP-CONTEXT (JSON):");
    expect(blocks[1].text).toContain(JSON.stringify(context));
  });

  it("houdt het stabiele blok constant terwijl de context wisselt (cache-vriendelijk)", () => {
    const a = buildSystem({ menu: [{ dish: "A" }] });
    const b = buildSystem({ menu: [{ dish: "B" }] });
    // Het gecachte prefix mag NIET meebewegen met de context, anders geen hits.
    expect(a[0].text).toBe(b[0].text);
    // Het dynamische blok verschilt juist wél.
    expect(a[1].text).not.toBe(b[1].text);
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
