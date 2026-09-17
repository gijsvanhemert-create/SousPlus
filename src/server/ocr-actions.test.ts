import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PriceChange } from "./watchdog";

// Unit-test voor de OCR-acties: (1) addCatalogItemFromLineAction — aanmaken van een
// nieuw artikel uit een niet-gekoppelde OCR-regel, plus de dup-check; en (2)
// applyInvoiceAction — het toepassen van gekoppelde factuurregels moet dezelfde
// Marge-Waakhond (evaluateMarginAlerts) triggeren als voorheen de re-sim-feed.
const { db, getTenant, evaluateMarginAlerts } = vi.hoisted(() => ({
  db: {
    catalogItem: {
      findFirst: vi.fn<(args: unknown) => Promise<{ id: string; name: string; price?: unknown } | null>>(async () => null),
      create: vi.fn<(args: unknown) => Promise<{ id: string; name: string }>>(async () => ({ id: "new1", name: "Mirin Hon" })),
      update: vi.fn(async () => ({})),
    },
    ingredientPrice: { create: vi.fn(async () => ({})) },
    recipeIngredient: { updateMany: vi.fn(async () => ({})) },
    // $transaction krijgt een array van (gemockte) operatie-promises; resolve ze.
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  },
  getTenant: vi.fn(async () => ({ locationId: "loc", userId: "u", orgId: "o", role: "CHEF" })),
  evaluateMarginAlerts: vi.fn(async () => {}),
}));
vi.mock("@/server/db", () => ({ prisma: db }));
vi.mock("@/server/tenant", () => ({ getTenant }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("./watchdog", () => ({ evaluateMarginAlerts }));

import { addCatalogItemFromLineAction, applyInvoiceAction } from "./ocr-actions";

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

describe("applyInvoiceAction", () => {
  it("werkt gekoppelde regels bij en triggert de Marge-Waakhond met de prijswijziging", async () => {
    // Bestaand catalogusartikel dat de regel matcht; oude prijs 9,80 → nieuw 11,20.
    db.catalogItem.findFirst.mockResolvedValueOnce({ id: "boter1", name: "Roomboter ongezouten", price: "9.80" });

    const res = await applyInvoiceAction({
      lines: [{ matchedId: "boter1", keyword: "roomboter", unitPrice: 11.2 }],
    });

    expect(res).toEqual({ applied: 1 });

    // Prijs landt op de catalogus, in de historie (source "ocr") en in de receptuur.
    expect(db.catalogItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "boter1" }, data: { price: "11.20" } }),
    );
    expect(db.ingredientPrice.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { catalogItemId: "boter1", price: "11.20", source: "ocr" } }),
    );
    expect(db.recipeIngredient.updateMany).toHaveBeenCalled();

    // Kern van deze opschoning: de Waakhond wordt vanuit de OCR-flow aangeroepen,
    // met een échte prijsstijging (oud < nieuw) als PriceChange.
    expect(evaluateMarginAlerts).toHaveBeenCalledTimes(1);
    const [locationId, changes] = evaluateMarginAlerts.mock.calls[0] as unknown as [string, PriceChange[]];
    expect(locationId).toBe("loc");
    expect(changes).toEqual([
      { keyword: "roomboter", name: "Roomboter ongezouten", oldPrice: 9.8, newPrice: 11.2 },
    ]);
  });

  it("slaat regels over waarvan het artikel niet in deze locatie bestaat (tenant-scoping)", async () => {
    db.catalogItem.findFirst.mockResolvedValueOnce(null);

    const res = await applyInvoiceAction({
      lines: [{ matchedId: "onbekend", keyword: "boter", unitPrice: 11.2 }],
    });

    expect(res).toEqual({ applied: 0 });
    expect(db.catalogItem.update).not.toHaveBeenCalled();
    // De Waakhond wordt nog steeds aangeroepen, maar met een lege changeset (no-op).
    expect(evaluateMarginAlerts).toHaveBeenCalledWith("loc", []);
  });
});
