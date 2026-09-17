import { describe, it, expect, beforeEach, vi } from "vitest";

// Unit-test voor de auto-markering in addComponent: een recept dat als component
// wordt toegevoegd en nog componentOnly=false is, wordt automatisch op true gezet
// (verstandige default; de chef kan het via de Lab-toggle terugzetten).

const { db, getTenant, assertComponentAllowed } = vi.hoisted(() => ({
  db: {
    recipeVersion: { findFirst: vi.fn() },
    recipe: { findFirst: vi.fn(), update: vi.fn() },
    recipeComponent: { create: vi.fn() },
    recipeIngredient: { findFirst: vi.fn(), update: vi.fn() },
    catalogItem: { findFirst: vi.fn(), create: vi.fn() },
    ingredientPrice: { create: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
  getTenant: vi.fn(async () => ({ locationId: "loc", userId: "u" })),
  assertComponentAllowed: vi.fn(async () => {}),
}));

vi.mock("@/server/db", () => ({ prisma: db }));
vi.mock("@/server/tenant", () => ({ getTenant }));
vi.mock("@/server/recipe-cost-graph", () => ({ assertComponentAllowed }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { Decimal } from "decimal.js";
import { addComponent, priceIngredientToCatalog } from "./recipe-actions";

const activeVersion = { id: "cv", yieldQty: "50", yieldUnit: "ml", yieldMode: "WEIGHT" };

beforeEach(() => {
  vi.clearAllMocks();
  db.recipeVersion.findFirst.mockResolvedValue({ id: "pv", recipeId: "pr", components: [] });
  db.recipeComponent.create.mockReturnValue("createOp");
  db.recipe.update.mockReturnValue("updateOp");
});

describe("addComponent auto-markering", () => {
  it("markeert een nog-niet-component recept automatisch als 'alleen component'", async () => {
    db.recipe.findFirst.mockResolvedValue({ id: "child", dish: "Beurre Blanc", componentOnly: false, activeVersion });

    const res = await addComponent({ parentVersionId: "pv", childRecipeId: "child" });

    expect(res).toEqual({ autoMarkedComponentOnly: true, dish: "Beurre Blanc" });
    expect(db.recipe.update).toHaveBeenCalledWith({
      where: { id: "child" },
      data: { componentOnly: true, isOnMenu: false },
    });
    // Create + update in één transactie.
    expect(db.$transaction).toHaveBeenCalledWith(["createOp", "updateOp"]);
  });

  it("laat een recept dat al componentOnly is ongemoeid", async () => {
    db.recipe.findFirst.mockResolvedValue({ id: "child", dish: "Pepersaus", componentOnly: true, activeVersion });

    const res = await addComponent({ parentVersionId: "pv", childRecipeId: "child" });

    expect(res).toEqual({ autoMarkedComponentOnly: false, dish: "Pepersaus" });
    expect(db.recipe.update).not.toHaveBeenCalled();
    expect(db.$transaction).toHaveBeenCalledWith(["createOp"]);
  });

  it("is idempotent: dubbele koppeling doet niets en markeert niet", async () => {
    db.recipeVersion.findFirst.mockResolvedValue({ id: "pv", recipeId: "pr", components: [{ childRecipeId: "child" }] });
    db.recipe.findFirst.mockResolvedValue({ id: "child", dish: "Pepersaus", componentOnly: false, activeVersion });

    const res = await addComponent({ parentVersionId: "pv", childRecipeId: "child" });

    expect(res).toBeUndefined();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.recipe.update).not.toHaveBeenCalled();
  });
});

describe("priceIngredientToCatalog — ongeprijsd ingrediënt aanvullen", () => {
  it("maakt een nieuw catalogusartikel (WEIGHT g→kg) en koppelt + prijst het ingrediënt", async () => {
    db.recipeIngredient.findFirst.mockResolvedValue({ id: "ing1", name: "Wilde daslook", unit: "g", mode: "WEIGHT" });
    db.catalogItem.findFirst.mockResolvedValue(null); // bestaat nog niet
    db.catalogItem.create.mockResolvedValue({ id: "cat_new" });

    const res = await priceIngredientToCatalog({ ingredientId: "ing1", price: "12,50", category: "Groente" });

    expect(res).toEqual({ ok: true, name: "Wilde daslook", created: true, price: "12.50" });
    // Catalogus-eenheid kg (uit g), default leverancier BEIDE, komma → punt.
    expect(db.catalogItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Wilde daslook", unit: "kg", supplier: "BEIDE", category: "Groente", price: "12.50" }),
      }),
    );
    expect(db.ingredientPrice.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ catalogItemId: "cat_new", source: "lab:new" }) }),
    );
    // Het ingrediënt is nu gekoppeld én geprijsd (was NULL).
    expect(db.recipeIngredient.update).toHaveBeenCalledWith({
      where: { id: "ing1" },
      data: { catalogItemId: "cat_new", pricePerUnit: "12.50" },
    });
  });

  it("een PIECE-ingrediënt behoudt zijn eigen stukseenheid", async () => {
    db.recipeIngredient.findFirst.mockResolvedValue({ id: "ing2", name: "Zuring per bosje", unit: "bosje", mode: "PIECE" });
    db.catalogItem.findFirst.mockResolvedValue(null);
    db.catalogItem.create.mockResolvedValue({ id: "cat_p" });

    await priceIngredientToCatalog({ ingredientId: "ing2", price: "1,80", category: "Groente" });

    expect(db.catalogItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ unit: "bosje", price: "1.80" }) }),
    );
  });

  it("koppelt aan een BESTAAND artikel en neemt de echte catalogusprijs over (geen nieuw artikel)", async () => {
    db.recipeIngredient.findFirst.mockResolvedValue({ id: "ing3", name: "Roomboter ongezouten", unit: "g", mode: "WEIGHT" });
    db.catalogItem.findFirst.mockResolvedValue({ id: "cat_boter", price: new Decimal("9.8") });

    const res = await priceIngredientToCatalog({ ingredientId: "ing3", price: "99,99", category: "Zuivel" });

    expect(res).toEqual({ ok: true, name: "Roomboter ongezouten", created: false, price: "9.80" });
    expect(db.catalogItem.create).not.toHaveBeenCalled();
    // De getypte 99,99 wordt genegeerd; de catalogusprijs 9,80 is bron van waarheid.
    expect(db.recipeIngredient.update).toHaveBeenCalledWith({
      where: { id: "ing3" },
      data: { catalogItemId: "cat_boter", pricePerUnit: "9.80" },
    });
  });

  it("weigert prijs 0 (geen stille €0 terug)", async () => {
    db.recipeIngredient.findFirst.mockResolvedValue({ id: "ing1", name: "X", unit: "g", mode: "WEIGHT" });

    const res = await priceIngredientToCatalog({ ingredientId: "ing1", price: "0", category: "Overig" });

    expect(res.ok).toBe(false);
    expect(db.catalogItem.create).not.toHaveBeenCalled();
    expect(db.recipeIngredient.update).not.toHaveBeenCalled();
  });

  it("weigert een ingrediënt uit een andere locatie (tenant-scoping)", async () => {
    db.recipeIngredient.findFirst.mockResolvedValue(null);

    const res = await priceIngredientToCatalog({ ingredientId: "ing_x", price: "5,00", category: "Overig" });

    expect(res).toEqual({ ok: false, error: expect.stringMatching(/niet gevonden/i) });
    expect(db.catalogItem.create).not.toHaveBeenCalled();
    expect(db.recipeIngredient.update).not.toHaveBeenCalled();
  });
});
