import { describe, it, expect, vi, beforeEach } from "vitest";

// Bewijst dat update_recipe_version een bestaand recept betrouwbaar vindt en
// bijwerkt zodra het model het ECHTE versie-id meekrijgt (uit de APP-CONTEXT),
// en dat de tenant-scoping klopt: een versie uit een andere locatie is
// onvindbaar. We mocken @/server/db met een kleine in-memory store.

type VersionRow = { id: string; recipeId: string; locationId: string; name: string; note: string | null; prepTimeMin: number; steps: string[] };
type RecipeRow = { id: string; locationId: string; dish: string; menuPrice: string };
type CatalogRow = { locationId: string; name: string; category: string; supplier: string; unit: string; price: string };
type AlertRow = { id: string; locationId: string; ingredient: string; resolved: boolean; resolution: string | null };

const { store, mocks } = vi.hoisted(() => {
  const store = {
    versions: [] as VersionRow[],
    recipes: [] as RecipeRow[],
    catalog: [] as CatalogRow[],
    alerts: [] as AlertRow[],
  };
  const mocks = {
    versionUpdate: vi.fn(),
    recipeUpdate: vi.fn(),
    alertUpdate: vi.fn(),
    versionCreate: vi.fn(),
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
      count: vi.fn(async () => store.versions.length),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        mocks.versionCreate({ data });
        return { id: "ver_new", recipeId: data.recipeId };
      }),
    },
    recipe: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; locationId: string } }) => {
        const r = store.recipes.find((x) => x.id === where.id && x.locationId === where.locationId);
        return r ? { id: r.id } : null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        mocks.recipeUpdate({ where, data });
        const r = store.recipes.find((x) => x.id === where.id);
        if (r) Object.assign(r, data);
        return r;
      }),
    },
    catalogItem: {
      // Alleen locationId-scoping is relevant voor deze test; de where-filters
      // op naam/categorie doen we bewust simpel na.
      findMany: vi.fn(async ({ where, take }: { where: { locationId: string }; take?: number }) => {
        return store.catalog.filter((c) => c.locationId === where.locationId).slice(0, take);
      }),
    },
    marginAlert: {
      // Tenant-scoping: id én locationId moeten matchen (zoals resolveAlert doet).
      findFirst: vi.fn(async ({ where }: { where: { id: string; locationId: string } }) => {
        return store.alerts.find((a) => a.id === where.id && a.locationId === where.locationId) ?? null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        mocks.alertUpdate({ where, data });
        const a = store.alerts.find((x) => x.id === where.id);
        if (a) Object.assign(a, data);
        return a;
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
  store.catalog = [
    { locationId: LOC_A, name: "Rode biet", category: "Groente", supplier: "HANOS", unit: "kg", price: "1.85" },
  ];
  store.alerts = [
    { id: "alert_boter", locationId: LOC_A, ingredient: "Roomboter ongezouten", resolved: false, resolution: null },
  ];
  mocks.versionUpdate.mockClear();
  mocks.recipeUpdate.mockClear();
  mocks.alertUpdate.mockClear();
  mocks.versionCreate.mockClear();
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

describe("search_ingredients.execute", () => {
  const tool = TOOL_BY_NAME.get("search_ingredients")!;

  it("levert de catalogus-treffers als JSON aan het model (interne werking intact)", async () => {
    const outcome = await tool.execute({ query: "biet" }, { locationId: LOC_A, userId: "u1" });

    const payload = JSON.parse(outcome.text) as { count: number; items: { name: string; price: number }[] };
    expect(payload.count).toBe(1);
    expect(payload.items[0]).toMatchObject({ name: "Rode biet", price: 1.85 });
  });

  it("toont GEEN UI-chip meer ('… artikelen gevonden' was debug-info)", async () => {
    const outcome = await tool.execute({ query: "biet" }, { locationId: LOC_A, userId: "u1" });
    expect(outcome.action).toBeUndefined();
  });
});

describe("resolve_margin_alert.execute", () => {
  const tool = TOOL_BY_NAME.get("resolve_margin_alert")!;

  it("is een confirm-gated tool", () => {
    expect(tool.confirm).toBe(true);
  });

  it("sluit de alert af met de vrije advies-tekst als resolution", async () => {
    const outcome = await tool.execute(
      { alertId: "alert_boter", resolution: "Portie roomboter naar 45g en menuprijs +€1,00" },
      { locationId: LOC_A, userId: "u1" },
    );

    // De alert is opgelost en de aanpak is vastgelegd (met Auguste-prefix).
    expect(mocks.alertUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "alert_boter" },
        data: expect.objectContaining({
          resolved: true,
          resolution: "Advies Chef Auguste — Portie roomboter naar 45g en menuprijs +€1,00",
        }),
      }),
    );
    expect(outcome.action).toEqual(
      expect.objectContaining({ kind: "watchdog", label: "Waakhond-alert opgelost" }),
    );
    expect(store.alerts[0].resolved).toBe(true);
  });

  it("sluit een alert uit een andere locatie NIET (tenant-scoping)", async () => {
    await expect(
      tool.execute({ alertId: "alert_boter", resolution: "iets" }, { locationId: LOC_B, userId: "u1" }),
    ).rejects.toThrow(/niet gevonden/i);
    expect(mocks.alertUpdate).not.toHaveBeenCalled();
  });
});

describe("save_recipe_version.execute — ongeprijsd ingrediënt", () => {
  const tool = TOOL_BY_NAME.get("save_recipe_version")!;

  it("slaat een ingrediënt zonder p op als pricePerUnit null (nooit €0) en meldt het", async () => {
    const outcome = await tool.execute(
      {
        recipeId: "rec_salmon",
        name: "Zomervariant",
        ingredients: [
          { name: "Zalmfilet", g: 150, p: 38.5 },
          { name: "Wilde tijm (nieuw)", g: 5 }, // p weggelaten = prijs onbekend
        ],
      },
      { locationId: LOC_A, userId: "u1" },
    );

    // De aangemaakte versie krijgt het ongeprijsde ingrediënt als pricePerUnit null.
    const created = mocks.versionCreate.mock.calls[0][0] as {
      data: { ingredients: { create: { name: string; pricePerUnit: string | null }[] } };
    };
    const rows = created.data.ingredients.create;
    expect(rows.find((r) => r.name === "Zalmfilet")?.pricePerUnit).toBe("38.5");
    expect(rows.find((r) => r.name === "Wilde tijm (nieuw)")?.pricePerUnit).toBeNull();

    // En het resultaat wijst Auguste er expliciet op (transparantie).
    expect(outcome.text).toMatch(/LET OP/);
    expect(outcome.text).toContain("Wilde tijm (nieuw)");
  });

  it("meldt niets bijzonders als alle ingrediënten geprijsd zijn", async () => {
    const outcome = await tool.execute(
      { recipeId: "rec_salmon", name: "Compleet", ingredients: [{ name: "Zalmfilet", g: 150, p: 38.5 }] },
      { locationId: LOC_A, userId: "u1" },
    );
    expect(outcome.text).not.toMatch(/LET OP/);
  });
});
