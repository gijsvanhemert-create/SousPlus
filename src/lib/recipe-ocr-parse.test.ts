import { describe, it, expect } from "vitest";
import { parseExtractedRecipe, toStorageIngredient, perCoverAmount } from "@/lib/recipe-ocr-parse";

describe("parseExtractedRecipe", () => {
  const good = JSON.stringify({
    dish: "Risotto",
    category: "Pasta",
    serves: 4,
    ingredients: [
      { name: "Arborio rijst", qty: 320, unit: "g" },
      { name: "Wilde daslook", qty: null, unit: null },
    ],
    steps: ["Fruit de sjalot.", "Voeg de rijst toe."],
    warnings: ["Hoeveelheid daslook onleesbaar."],
  });

  it("parseert een geldig recept", () => {
    const r = parseExtractedRecipe(good)!;
    expect(r.dish).toBe("Risotto");
    expect(r.serves).toBe(4);
    expect(r.ingredients).toHaveLength(2);
    expect(r.ingredients[1]).toEqual({ name: "Wilde daslook", qty: null, unit: null });
    expect(r.steps).toHaveLength(2);
    expect(r.warnings[0]).toMatch(/onleesbaar/);
  });

  it("strip code-fences en whitespace", () => {
    const r = parseExtractedRecipe("```json\n" + good + "\n```");
    expect(r?.dish).toBe("Risotto");
  });

  it("geeft null bij ongeldige JSON of een niet-object", () => {
    expect(parseExtractedRecipe("geen json")).toBeNull();
    expect(parseExtractedRecipe("[1,2,3]")).toBeNull();
  });

  it("geeft null als er noch naam noch ingrediënten zijn", () => {
    expect(parseExtractedRecipe(JSON.stringify({ dish: "", ingredients: [] }))).toBeNull();
  });

  it("filtert onbruikbare ingrediënt-/stap-regels en verzint geen getallen", () => {
    const r = parseExtractedRecipe(
      JSON.stringify({
        dish: "Test",
        ingredients: [{ name: "" }, { name: "Boter", qty: "onleesbaar", unit: "g" }],
        steps: ["  ", "Meng alles."],
      }),
    )!;
    expect(r.ingredients).toHaveLength(1);
    expect(r.ingredients[0]).toEqual({ name: "Boter", qty: null, unit: "g" }); // "onleesbaar" → null
    expect(r.steps).toEqual(["Meng alles."]);
  });
});

describe("toStorageIngredient", () => {
  it("massa → gram (WEIGHT), met kg×1000", () => {
    expect(toStorageIngredient({ qty: 320, unit: "g" })).toEqual({ amount: 320, unit: "g", mode: "WEIGHT" });
    expect(toStorageIngredient({ qty: 0.5, unit: "kg" })).toEqual({ amount: 500, unit: "g", mode: "WEIGHT" });
  });

  it("volume → milliliter (WEIGHT), met L×1000 en cl/dl", () => {
    expect(toStorageIngredient({ qty: 2, unit: "l" })).toEqual({ amount: 2000, unit: "ml", mode: "WEIGHT" });
    expect(toStorageIngredient({ qty: 5, unit: "cl" })).toEqual({ amount: 50, unit: "ml", mode: "WEIGHT" });
  });

  it("onbekende/lege eenheid → PIECE met de eenheid als label", () => {
    expect(toStorageIngredient({ qty: 2, unit: "el" })).toEqual({ amount: 2, unit: "el", mode: "PIECE" });
    expect(toStorageIngredient({ qty: 3, unit: null })).toEqual({ amount: 3, unit: "stuk", mode: "PIECE" });
  });

  it("onleesbare hoeveelheid blijft null (nooit 0)", () => {
    expect(toStorageIngredient({ qty: null, unit: "g" })).toEqual({ amount: null, unit: "g", mode: "WEIGHT" });
  });
});

describe("perCoverAmount", () => {
  it("deelt totalen door het aantal personen", () => {
    expect(perCoverAmount(320, 4, "total")).toBe(80);
  });

  it("laat per-persoon-hoeveelheden ongemoeid", () => {
    expect(perCoverAmount(80, 4, "per_person")).toBe(80);
  });

  it("deelt niet bij ontbrekend/0 aantal personen of null-hoeveelheid", () => {
    expect(perCoverAmount(320, null, "total")).toBe(320);
    expect(perCoverAmount(320, 0, "total")).toBe(320);
    expect(perCoverAmount(null, 4, "total")).toBeNull();
  });
});
