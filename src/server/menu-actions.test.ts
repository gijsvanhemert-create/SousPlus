import { describe, it, expect, beforeEach, vi } from "vitest";

// updatePopularity: handmatige invoer van verkoopvolume voor de Menu Matrix.
// Zet de waarde én een tijdstempel (voor de "verouderd"-signalering), locatie-
// gescopet. We mocken prisma + tenant.

const { db, getTenant } = vi.hoisted(() => ({
  db: { recipe: { findFirst: vi.fn(), update: vi.fn() } },
  getTenant: vi.fn(async () => ({ locationId: "loc", userId: "u" })),
}));

vi.mock("@/server/db", () => ({ prisma: db }));
vi.mock("@/server/tenant", () => ({ getTenant }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updatePopularity } from "./menu-actions";

beforeEach(() => {
  vi.clearAllMocks();
  db.recipe.findFirst.mockResolvedValue({ id: "rec1" });
});

describe("updatePopularity", () => {
  it("zet het verkoopvolume én een tijdstempel (voor verouderd-signalering)", async () => {
    await updatePopularity({ recipeId: "rec1", coversPerMonth: 240 });

    expect(db.recipe.update).toHaveBeenCalledWith({
      where: { id: "rec1" },
      data: { popularity: 240, popularityUpdatedAt: expect.any(Date) },
    });
  });

  it("accepteert 0 (gerecht wordt niet verkocht)", async () => {
    await updatePopularity({ recipeId: "rec1", coversPerMonth: 0 });
    expect(db.recipe.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ popularity: 0 }) }),
    );
  });

  it("weigert een negatieve of niet-gehele waarde (zod)", async () => {
    await expect(updatePopularity({ recipeId: "rec1", coversPerMonth: -5 })).rejects.toThrow();
    await expect(updatePopularity({ recipeId: "rec1", coversPerMonth: 12.5 })).rejects.toThrow();
    expect(db.recipe.update).not.toHaveBeenCalled();
  });

  it("weigert een recept uit een andere locatie (tenant-scoping)", async () => {
    db.recipe.findFirst.mockResolvedValue(null);
    await expect(updatePopularity({ recipeId: "rec_x", coversPerMonth: 100 })).rejects.toThrow(/niet gevonden/i);
    expect(db.recipe.update).not.toHaveBeenCalled();
  });
});
