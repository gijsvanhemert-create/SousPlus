import { describe, it, expect, vi, beforeEach } from "vitest";

// Kern-garantie van fase 1: de Marge-Waakhond slaat een recept met een ONBEKENDE
// (onvolledige) marge over. Een ongeprijsd ingrediënt maakt de foodcost — en dus
// de marge — onbepaalbaar; dat mag NOOIT als 0% of een extreme waarde worden
// vergeleken, want dat zou valse alerts opleveren. We mocken @/server/db met een
// kleine in-memory store en voeren evaluateMarginAlerts/getOpenAlerts echt uit.

type IngRow = { name: string; amount: string; mode: "WEIGHT" | "PIECE"; pricePerUnit: string | null };
type RecipeRow = {
  id: string;
  dish: string;
  menuPrice: string;
  activeVersion: { ingredients: IngRow[] } | null;
};
type AlertRow = {
  id: string;
  locationId: string;
  ingredient: string;
  deltaPct: string;
  affectedRecipeId: string | null;
  resolved: boolean;
  createdAt: Date;
};

const { store, mocks } = vi.hoisted(() => {
  const store = { recipes: [] as RecipeRow[], alerts: [] as AlertRow[] };
  const mocks = { alertCreate: vi.fn() };
  return { store, mocks };
});

vi.mock("@/server/db", () => ({
  prisma: {
    recipe: {
      findMany: vi.fn(async () => store.recipes),
    },
    marginAlert: {
      findMany: vi.fn(async ({ where }: { where: { resolved: boolean } }) =>
        store.alerts.filter((a) => a.resolved === where.resolved),
      ),
      findFirst: vi.fn(async ({ where }: { where: { affectedRecipeId: string; resolved: boolean } }) =>
        store.alerts.find((a) => a.affectedRecipeId === where.affectedRecipeId && a.resolved === where.resolved) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Omit<AlertRow, "id" | "createdAt"> }) => {
        mocks.alertCreate(data);
        const row: AlertRow = { id: `alert_${store.alerts.length + 1}`, createdAt: new Date(), ...data };
        store.alerts.push(row);
        return row;
      }),
    },
  },
}));

// switchSupplierFor wordt in dit pad niet aangeroepen, maar het import-pad hangt
// aan prisma; die is al gemockt. Geen aparte mock nodig.

import { evaluateMarginAlerts, getOpenAlerts, type PriceChange } from "./watchdog";

const LOC = "loc_A";

// Roomboter +14% (9,00 → 10,26) drukt een boter-zwaar gerecht onder de 70%.
const butterHike: PriceChange[] = [{ keyword: "roomboter", name: "Roomboter ongezouten", oldPrice: 9.0, newPrice: 10.26 }];

// Volledig geprijsd, boter-zwaar: 330 g @ €10,26/kg = €3,3858 → marge 66,14% (< 70).
const normalVersion = { ingredients: [{ name: "Roomboter ongezouten", amount: "330", mode: "WEIGHT" as const, pricePerUnit: "10.26" }] };

beforeEach(() => {
  store.recipes = [];
  store.alerts = [];
  mocks.alertCreate.mockClear();
});

describe("evaluateMarginAlerts — onvolledige marge overslaan", () => {
  it("slaat een recept met een ongeprijsd ingrediënt over (geen valse alert)", async () => {
    // Zelfde boter-zware basis, maar met één extra ingrediënt zónder bekende prijs
    // ⇒ foodcost/marge onbepaalbaar ⇒ mag NIET als kritiek worden gealarmeerd.
    store.recipes = [
      {
        id: "rec_incomplete",
        dish: "Experimenteel gerecht",
        menuPrice: "10.00",
        activeVersion: {
          ingredients: [
            { name: "Roomboter ongezouten", amount: "330", mode: "WEIGHT", pricePerUnit: "10.26" },
            { name: "Wilde tijm (nieuw)", amount: "5", mode: "WEIGHT", pricePerUnit: null },
          ],
        },
      },
    ];

    await evaluateMarginAlerts(LOC, butterHike);

    // Ondanks de boterstijging: geen alert, want de marge is onbekend (niet 0%/extreem).
    expect(mocks.alertCreate).not.toHaveBeenCalled();
    expect(store.alerts).toHaveLength(0);
  });

  it("alarmeert wél een identiek maar vólledig geprijsd gerecht (test bijt)", async () => {
    store.recipes = [
      { id: "rec_normal", dish: "Boterzalm", menuPrice: "10.00", activeVersion: normalVersion },
    ];

    await evaluateMarginAlerts(LOC, butterHike);

    expect(mocks.alertCreate).toHaveBeenCalledTimes(1);
    expect(mocks.alertCreate).toHaveBeenCalledWith(
      expect.objectContaining({ affectedRecipeId: "rec_normal", ingredient: "Roomboter ongezouten" }),
    );
  });

  it("alarmeert alleen het geprijsde gerecht als beide naast elkaar bestaan", async () => {
    store.recipes = [
      {
        id: "rec_incomplete",
        dish: "Experimenteel gerecht",
        menuPrice: "10.00",
        activeVersion: {
          ingredients: [
            { name: "Roomboter ongezouten", amount: "330", mode: "WEIGHT", pricePerUnit: "10.26" },
            { name: "Wilde tijm (nieuw)", amount: "5", mode: "WEIGHT", pricePerUnit: null },
          ],
        },
      },
      { id: "rec_normal", dish: "Boterzalm", menuPrice: "10.00", activeVersion: normalVersion },
    ];

    await evaluateMarginAlerts(LOC, butterHike);

    expect(mocks.alertCreate).toHaveBeenCalledTimes(1);
    expect(mocks.alertCreate).toHaveBeenCalledWith(expect.objectContaining({ affectedRecipeId: "rec_normal" }));
  });
});

describe("getOpenAlerts — onbekende marge niet als getal fabriceren", () => {
  it("geeft currentMarginPct = null voor een recept met een ongeprijsd ingrediënt", async () => {
    store.recipes = [
      {
        id: "rec_incomplete",
        dish: "Experimenteel gerecht",
        menuPrice: "10.00",
        activeVersion: {
          ingredients: [{ name: "Wilde tijm (nieuw)", amount: "5", mode: "WEIGHT", pricePerUnit: null }],
        },
      },
    ];
    store.alerts = [
      {
        id: "alert_1",
        locationId: LOC,
        ingredient: "Roomboter ongezouten",
        deltaPct: "14.00",
        affectedRecipeId: "rec_incomplete",
        resolved: false,
        createdAt: new Date(),
      },
    ];

    const views = await getOpenAlerts(LOC);
    expect(views).toHaveLength(1);
    expect(views[0].currentMarginPct).toBeNull();
  });
});
