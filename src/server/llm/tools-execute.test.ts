import { describe, it, expect, vi, beforeEach } from "vitest";

// Bewijst dat update_recipe_version een bestaand recept betrouwbaar vindt en
// bijwerkt zodra het model het ECHTE versie-id meekrijgt (uit de APP-CONTEXT),
// en dat de tenant-scoping klopt: een versie uit een andere locatie is
// onvindbaar. We mocken @/server/db met een kleine in-memory store.

type VersionRow = { id: string; recipeId: string; locationId: string; name: string; note: string | null; prepTimeMin: number; steps: string[] };
type RecipeRow = { id: string; locationId: string; dish: string; menuPrice: string };

const { store, mocks } = vi.hoisted(() => {
  const store = {
    versions: [] as VersionRow[],
    recipes: [] as RecipeRow[],
  };
  const mocks = {
    versionUpdate: vi.fn(),
    recipeUpdate: vi.fn(),
  };
  return { store, mocks };
});

vi.mock("@/server/db", () => ({
  prisma: {
    recipeVersion: {
      // Bootst de echte where-scoping na: id én recipe.locationId moeten matchen.
      findFirst: vi.fn(async ({ where }: { where: { id: string; recipe: { locationId: string } } }) => {
        const v = store.versions.find((x) => x.id === where.id && x.locationId === where.recipe.locationId);
        return v ? { id: v.id, recipeId: v.recipeId } : null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        mocks.versionUpdate({ where, data });
        const v = store.versions.find((x) => x.id === where.id);
        if (v) Object.assign(v, data);
        return v;
      }),
    },
    recipe: {
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        mocks.recipeUpdate({ where, data });
        const r = store.recipes.find((x) => x.id === where.id);
        if (r) Object.assign(r, data);
        return r;
      }),
    },
  },
}));

// Na de mock importeren zodat de tool de gemockte prisma gebruikt.
import { TOOL_BY_NAME } from "./tools";

const LOC_A = "loc_A";
const LOC_B = "loc_B";

beforeEach(() => {
  store.versions = [
    { id: "ver_salmon_v12", recipeId: "rec_salmon", locationId: LOC_A, name: "Witte Miso", note: null, prepTimeMin: 20, steps: [] },
  ];
  store.recipes = [{ id: "rec_salmon", locationId: LOC_A, dish: "Miso-Glazed Salmon", menuPrice: "28.00" }];
  mocks.versionUpdate.mockClear();
  mocks.recipeUpdate.mockClear();
});

describe("update_recipe_version.execute", () => {
  const tool = TOOL_BY_NAME.get("update_recipe_version")!;

  it("werkt een bestaande versie bij in de juiste tenant en biedt een Lab-knop (zonder auto-navigatie)", async () => {
    const outcome = await tool.execute({ id: "ver_salmon_v12", menuPrice: 30 }, { locationId: LOC_A, userId: "u1" });

    expect(outcome.text).toContain("bijgewerkt");
    // Geen automatische navigatie meer; de gebruiker springt zelf via de knop.
    expect(outcome.navigateTo).toBeUndefined();
    expect(outcome.action?.href).toBe("/lab?recipe=rec_salmon");
    // Menuprijs-wijziging landt op het recept, genormaliseerd naar 2 decimalen.
    expect(mocks.recipeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "rec_salmon" }, data: expect.objectContaining({ menuPrice: "30.00" }) }),
    );
  });

  it("vindt een versie uit een andere locatie NIET (tenant-scoping)", async () => {
    await expect(
      tool.execute({ id: "ver_salmon_v12", menuPrice: 30 }, { locationId: LOC_B, userId: "u1" }),
    ).rejects.toThrow(/niet gevonden/i);
    expect(mocks.versionUpdate).not.toHaveBeenCalled();
    expect(mocks.recipeUpdate).not.toHaveBeenCalled();
  });
});
