import { describe, it, expect, vi, beforeEach } from "vitest";

// scanRecipe: extraheert een recept (gemockt model) en koppelt ingrediënten aan de
// catalogus. Kern: een niet-gematcht ingrediënt krijgt pricePerUnit null — het
// haakt zo naadloos in de ongeprijsde-ingrediënten-keten (Lab toont "onvolledig").

const { run, catalog } = vi.hoisted(() => ({ run: vi.fn(), catalog: { findMany: vi.fn() } }));

vi.mock("@/server/llm/router", () => ({ getRouter: () => ({ run }) }));
vi.mock("@/server/db", () => ({ prisma: { catalogItem: catalog } }));

import { scanRecipe } from "./recipe-ocr";

function modelReturns(obj: unknown) {
  run.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify(obj) }], stopReason: "end_turn" });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Eén catalogusartikel; bestCandidate matcht op token-overlap (zalmfilet), niet op onzin.
  catalog.findMany.mockResolvedValue([{ id: "cat_salmon", name: "Zalmfilet", price: "38.50" }]);
});

describe("scanRecipe", () => {
  it("koppelt een gematcht ingrediënt aan de catalogusprijs en laat een onbekend ingrediënt ongeprijsd", async () => {
    modelReturns({
      dish: "Gerookte zalm",
      serves: 2,
      ingredients: [
        { name: "Zalmfilet", qty: 200, unit: "g" },
        { name: "Zjolokia-nevelpeper", qty: 3, unit: "el" },
      ],
      steps: ["Rook de zalm."],
      warnings: [],
    });

    const recipe = (await scanRecipe({ kind: "text", text: "..." }, "loc"))!;

    expect(recipe.dish).toBe("Gerookte zalm");
    expect(recipe.serves).toBe(2);

    // Gematcht: catalogus-id + echte prijs, WEIGHT in gram.
    expect(recipe.ingredients[0]).toMatchObject({
      name: "Zalmfilet",
      matchedId: "cat_salmon",
      pricePerUnit: 38.5,
      amount: 200,
      mode: "WEIGHT",
    });

    // Niet gematcht: prijs onbekend (null) → ongeprijsde-keten; el → PIECE.
    expect(recipe.ingredients[1]).toMatchObject({
      name: "Zjolokia-nevelpeper",
      matchedId: null,
      pricePerUnit: null,
      amount: 3,
      mode: "PIECE",
    });

    // Tier 2 gebruikt, met een recept-actie voor de telemetrie.
    expect(run).toHaveBeenCalledWith(
      "tier2",
      expect.anything(),
      expect.objectContaining({ action: "recipe:text" }),
    );
  });

  it("geeft null als het model geen bruikbaar recept teruggeeft", async () => {
    modelReturns({ dish: "", ingredients: [] });
    expect(await scanRecipe({ kind: "text", text: "..." }, "loc")).toBeNull();
  });
});
