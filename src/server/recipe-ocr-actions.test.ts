import { describe, it, expect, vi, beforeEach } from "vitest";

// saveScannedRecipeAction: maakt het (gecorrigeerde) recept aan met per-persoon-
// normalisatie en de veilige omgang met onbekende hoeveelheden (prijs onbekend,
// nooit stille €0). We mocken prisma + tenant.

const { db, getTenant, versionCreate } = vi.hoisted(() => ({
  db: {
    recipe: { create: vi.fn(), update: vi.fn() },
    recipeVersion: { create: vi.fn() },
    catalogItem: { findMany: vi.fn() },
  },
  getTenant: vi.fn(async () => ({ locationId: "loc", userId: "u" })),
  versionCreate: vi.fn(),
}));

vi.mock("@/server/db", () => ({ prisma: db }));
vi.mock("@/server/tenant", () => ({ getTenant }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveScannedRecipeAction } from "./recipe-ocr-actions";

beforeEach(() => {
  vi.clearAllMocks();
  db.recipe.create.mockResolvedValue({ id: "rec_new" });
  db.recipeVersion.create.mockImplementation(async (args: unknown) => {
    versionCreate(args);
    return { id: "ver_new" };
  });
  db.catalogItem.findMany.mockResolvedValue([{ id: "cat_salmon" }]); // enige geldige koppeling
});

function ingredientsFromLastVersion() {
  const args = versionCreate.mock.calls[0][0] as {
    data: { ingredients: { create: { name: string; amount: string; pricePerUnit: string | null; catalogItemId: string | null; mode: string }[] } };
  };
  return args.data.ingredients.create;
}

const baseInput = {
  dish: "Risotto",
  portionBasis: "total" as const,
  serves: 4,
  ingredients: [
    { name: "Arborio rijst", amount: 320, unit: "g", mode: "WEIGHT" as const, catalogItemId: "cat_salmon", pricePerUnit: 2.1 },
    { name: "Wilde daslook", amount: null, unit: "stuk", mode: "PIECE" as const, catalogItemId: null, pricePerUnit: null },
  ],
  steps: ["Fruit de sjalot.", "Voeg rijst toe."],
};

describe("saveScannedRecipeAction", () => {
  it("normaliseert totalen naar per couvert (320 g / 4 = 80 g)", async () => {
    const res = await saveScannedRecipeAction(baseInput);
    expect(res).toEqual({ ok: true, recipeId: "rec_new", dish: "Risotto" });

    const rows = ingredientsFromLastVersion();
    expect(rows[0]).toMatchObject({ name: "Arborio rijst", amount: "80.000", pricePerUnit: "2.10", catalogItemId: "cat_salmon" });
  });

  it("onbekende hoeveelheid ⇒ amount 0 én prijs null (onvolledig, geen stille €0)", async () => {
    await saveScannedRecipeAction(baseInput);
    const rows = ingredientsFromLastVersion();
    expect(rows[1]).toMatchObject({ name: "Wilde daslook", amount: "0.000", pricePerUnit: null, catalogItemId: null });
  });

  it("per_person laat de hoeveelheden ongemoeid", async () => {
    await saveScannedRecipeAction({ ...baseInput, portionBasis: "per_person" });
    expect(ingredientsFromLastVersion()[0].amount).toBe("320.000");
  });

  it("negeert een catalogItemId die niet in deze locatie bestaat", async () => {
    await saveScannedRecipeAction({
      ...baseInput,
      ingredients: [
        { name: "Vreemd artikel", amount: 100, unit: "g", mode: "WEIGHT", catalogItemId: "cat_fremd", pricePerUnit: 5 },
      ],
    });
    expect(ingredientsFromLastVersion()[0].catalogItemId).toBeNull();
  });

  it("zet de nieuwe versie als actieve versie", async () => {
    await saveScannedRecipeAction(baseInput);
    expect(db.recipe.update).toHaveBeenCalledWith({ where: { id: "rec_new" }, data: { activeVersionId: "ver_new" } });
  });

  it("weigert een recept zonder naam (zod)", async () => {
    const res = await saveScannedRecipeAction({ ...baseInput, dish: "" });
    expect(res.ok).toBe(false);
    expect(db.recipe.create).not.toHaveBeenCalled();
  });
});
