import { describe, it, expect, vi, beforeEach } from "vitest";

// Unit-test voor addCatalogItemFromLineAction: aanmaken van een nieuw artikel uit
// een niet-gekoppelde OCR-regel, plus de dup-check die duplicaten voorkomt.
const { db, getTenant } = vi.hoisted(() => ({
  db: {
    catalogItem: {
      findFirst: vi.fn<(args: unknown) => Promise<{ id: string; name: string } | null>>(async () => null),
      create: vi.fn<(args: unknown) => Promise<{ id: string; name: string }>>(async () => ({ id: "new1", name: "Mirin Hon" })),
    },
    ingredientPrice: { create: vi.fn(async () => ({})) },
  },
  getTenant: vi.fn(async () => ({ locationId: "loc", userId: "u", orgId: "o", role: "CHEF" })),
}));
vi.mock("@/server/db", () => ({ prisma: db }));
vi.mock("@/server/tenant", () => ({ getTenant }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addCatalogItemFromLineAction } from "./ocr-actions";

beforeEach(() => vi.clearAllMocks());

describe("addCatalogItemFromLineAction", () => {
  it("maakt een nieuw catalogusartikel aan met defaults en een prijshistorie-regel", async () => {
    const res = await addCatalogItemFromLineAction({ name: "Mirin Hon", unit: "L", price: 9.8, category: "Overig" });

    expect(res).toEqual({ ok: true, id: "new1", name: "Mirin Hon", created: true });

    expect(db.catalogItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          locationId: "loc",
          name: "Mirin Hon",
          category: "Overig",
          supplier: "BEIDE", // neutrale default
          unit: "L",
          price: "9.80", // op 2 decimalen als string
        }),
      }),
    );

    expect(db.ingredientPrice.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { catalogItemId: "new1", price: "9.80", source: "ocr:new" } }),
    );
  });

  it("maakt geen duplicaat wanneer de naam al bestaat op de locatie", async () => {
    db.catalogItem.findFirst.mockResolvedValueOnce({ id: "exist1", name: "Mirin Hon" });

    const res = await addCatalogItemFromLineAction({ name: "mirin hon", unit: "L", price: 9.8, category: "Overig" });

    expect(res).toEqual({ ok: true, id: "exist1", name: "Mirin Hon", created: false });
    expect(db.catalogItem.create).not.toHaveBeenCalled();
    expect(db.ingredientPrice.create).not.toHaveBeenCalled();
  });

  it("geeft een bruikbare melding bij een verlopen sessie (FK-violation P2003)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.catalogItem.create.mockRejectedValueOnce(Object.assign(new Error("FK"), { code: "P2003" }));

    const res = await addCatalogItemFromLineAction({ name: "Nieuw artikel", unit: "kg", price: 5, category: "Overig" });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/sessie/i);
  });

  it("weigert een negatieve prijs", async () => {
    await expect(
      addCatalogItemFromLineAction({ name: "X", unit: "kg", price: -1, category: "Overig" }),
    ).rejects.toBeTruthy();
  });
});
