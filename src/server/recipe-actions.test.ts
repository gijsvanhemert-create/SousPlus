import { describe, it, expect, beforeEach, vi } from "vitest";

// Unit-test voor de auto-markering in addComponent: een recept dat als component
// wordt toegevoegd en nog componentOnly=false is, wordt automatisch op true gezet
// (verstandige default; de chef kan het via de Lab-toggle terugzetten).

const { db, getTenant, assertComponentAllowed } = vi.hoisted(() => ({
  db: {
    recipeVersion: { findFirst: vi.fn() },
    recipe: { findFirst: vi.fn(), update: vi.fn() },
    recipeComponent: { create: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
  getTenant: vi.fn(async () => ({ locationId: "loc", userId: "u" })),
  assertComponentAllowed: vi.fn(async () => {}),
}));

vi.mock("@/server/db", () => ({ prisma: db }));
vi.mock("@/server/tenant", () => ({ getTenant }));
vi.mock("@/server/recipe-cost-graph", () => ({ assertComponentAllowed }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addComponent } from "./recipe-actions";

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
    expect(db.recipe.update).toHaveBeenCalledWith({ where: { id: "child" }, data: { componentOnly: true } });
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
