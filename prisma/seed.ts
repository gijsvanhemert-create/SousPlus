import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { Supplier, CostMode, Cmp } from "../src/generated/prisma/enums";

const connectionString = process.env.DATABASE_URL;
// Supabase pooler vereist TLS; de cert-chain valideren we niet in dev (pin de
// Supabase-CA in productie). Zelfde aanpak als src/server/db.ts.
const ssl = /sslmode=(require|no-verify)|supabase\.com/.test(connectionString ?? "")
  ? { rejectUnauthorized: false }
  : undefined;
const adapter = new PrismaPg({ connectionString, ssl });
const prisma = new PrismaClient({ adapter });

const DEMO_PASSWORD = "demo1234";

// --- CSV-catalogus -----------------------------------------------------------
type CsvRow = {
  id: string;
  naam: string;
  categorie: string;
  leverancier: string;
  eenheid: string;
  prijs_eur: string;
};

function loadCatalog(): CsvRow[] {
  const csvPath = path.join(process.cwd(), "prisma", "seed", "sousplus_ingredienten.csv");
  const raw = readFileSync(csvPath, "utf8");
  return parse(raw, {
    delimiter: ";",
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as CsvRow[];
}

function toSupplier(s: string): Supplier {
  const v = s.trim().toLowerCase();
  if (v === "hanos") return Supplier.HANOS;
  if (v === "sligro") return Supplier.SLIGRO;
  return Supplier.BEIDE;
}

function toPrice(s: string): string {
  // "28,50" -> "28.50"
  return s.replace(/\./g, "").replace(",", ".").trim();
}

// --- Receptuur (uit het prototype: Miso-Glazed Salmon, 3 versies) -----------
type SeedIng = { name: string; amount: number; unit: string; price: number; mode?: CostMode };

const SALMON_VERSIONS: {
  label: string;
  name: string;
  note: string;
  prepTimeMin: number;
  ingredients: SeedIng[];
  steps: string[];
}[] = [
  {
    label: "v1.0",
    name: "Original",
    note: "Klassieke teriyaki-glace met bruine suiker en sojasaus. Rijk en zoet — maar de marge staat onder druk.",
    prepTimeMin: 28,
    ingredients: [
      { name: "Zalmfilet", amount: 180, unit: "g", price: 28.5 },
      { name: "Sojasaus", amount: 20, unit: "ml", price: 6.5 },
      { name: "Bruine suiker", amount: 18, unit: "g", price: 2.2 },
      { name: "Mirin", amount: 15, unit: "ml", price: 9.5 },
      { name: "Roomboter", amount: 50, unit: "g", price: 9.8 },
      { name: "Lente-ui", amount: 10, unit: "g", price: 6 },
      { name: "Sesamzaad", amount: 3, unit: "g", price: 11 },
      { name: "Sushirijst", amount: 90, unit: "g", price: 3.8 },
    ],
    steps: [
      "Kook de teriyaki-glace in van sojasaus, mirin en bruine suiker.",
      "Marineer de zalm 20 minuten, velkant boven.",
      "Stoom de sushirijst en houd warm onder een vochtige doek.",
      "Bak de zalm op de velkant krokant, ± 4 minuten.",
      "Lak de zalm onder de salamander tot glanzend.",
      "Werk af met roomboter, lente-ui en sesam.",
    ],
  },
  {
    label: "v1.1",
    name: "Minder Zout",
    note: "Natriumarme iteratie: sojasaus deels vervangen door tamari, minder suiker. Schonere smaak.",
    prepTimeMin: 30,
    ingredients: [
      { name: "Zalmfilet", amount: 180, unit: "g", price: 28.5 },
      { name: "Tamari (natriumarm)", amount: 14, unit: "ml", price: 8.2 },
      { name: "Bruine suiker", amount: 12, unit: "g", price: 2.2 },
      { name: "Mirin", amount: 15, unit: "ml", price: 9.5 },
      { name: "Roomboter", amount: 55, unit: "g", price: 9.8 },
      { name: "Prei (gegrild)", amount: 12, unit: "g", price: 6 },
      { name: "Sesamzaad", amount: 3, unit: "g", price: 11 },
      { name: "Sushirijst", amount: 90, unit: "g", price: 3.8 },
    ],
    steps: [
      "Meng tamari, mirin en een snuf suiker tot een lichte glace.",
      "Marineer de zalm 30 minuten, velkant boven.",
      "Stoom de sushirijst en houd warm.",
      "Bak de zalm krokant op de velkant, ± 4 minuten.",
      "Glaceer kort en houd de garing rosé.",
      "Monteer met roomboter, plateer op gegrilde prei en sesam.",
    ],
  },
  {
    label: "v1.2",
    name: "Witte Miso",
    note: "Actieve versie. Witte miso, sake en mirin geven diepe umami en een gelakte glans, afgewerkt met beurre blanc.",
    prepTimeMin: 32,
    ingredients: [
      { name: "Zalmfilet", amount: 180, unit: "g", price: 28.5 },
      { name: "Witte miso", amount: 25, unit: "g", price: 12 },
      { name: "Mirin", amount: 15, unit: "ml", price: 9.5 },
      { name: "Sake", amount: 10, unit: "ml", price: 14 },
      { name: "Roomboter (beurre blanc)", amount: 60, unit: "g", price: 9.8 },
      { name: "Bruine suiker", amount: 8, unit: "g", price: 2.2 },
      { name: "Prei (gegrild)", amount: 12, unit: "g", price: 6 },
      { name: "Sesamzaad", amount: 3, unit: "g", price: 11 },
      { name: "Sushirijst", amount: 90, unit: "g", price: 3.8 },
    ],
    steps: [
      "Klop witte miso, mirin, sake en bruine suiker tot een gladde glace.",
      "Marineer de zalm 30 minuten, velkant boven.",
      "Stoom de sushirijst en houd warm onder een vochtige doek.",
      "Bak de zalm op de velkant krokant, ± 4 minuten.",
      "Glaceer en lak af onder de salamander tot gelakt.",
      "Monteer een beurre blanc, plateer over gegrilde prei, werk af met sesam.",
    ],
  },
];

// Overige menukaart (uit prototype LIBRARY). Geen detail-receptuur in de bron:
// we seeden één indicatieve foodcost-regel zodat de marge klopt met het prototype.
const OTHER_DISHES: {
  dish: string;
  category: string;
  menuPrice: number;
  marginPct: number;
  popularity: number;
  favorite: boolean;
}[] = [
  { dish: "Truffel Tagliatelle", category: "Pasta", menuPrice: 19.5, marginPct: 68, popularity: 180, favorite: false },
  { dish: "Cacio e Pepe", category: "Pasta", menuPrice: 16.5, marginPct: 73, popularity: 300, favorite: false },
  { dish: "Heritage Beet Tartare", category: "Vegetable", menuPrice: 14.0, marginPct: 78, popularity: 90, favorite: true },
  { dish: "Seared Scallops", category: "Seafood", menuPrice: 26.0, marginPct: 66, popularity: 70, favorite: false },
  { dish: "Dark Chocolate Fondant", category: "Desserts", menuPrice: 11.0, marginPct: 82, popularity: 210, favorite: false },
];

const HACCP_CHECKPOINTS: { zone: string; target: string; limitValue: number; cmp: Cmp; unit: string }[] = [
  { zone: "Koeling 1 · vis", target: "≤ 4 °C", limitValue: 4, cmp: Cmp.LTE, unit: "°C" },
  { zone: "Vriezer", target: "≤ -18 °C", limitValue: -18, cmp: Cmp.LTE, unit: "°C" },
  { zone: "Bain-marie · warmhoud", target: "≥ 63 °C", limitValue: 63, cmp: Cmp.GTE, unit: "°C" },
  { zone: "Ontvangst levering", target: "≤ 7 °C", limitValue: 7, cmp: Cmp.LTE, unit: "°C" },
];

async function main() {
  console.log("→ Seed gestart. Bestaande data wordt opgeschoond…");

  // Schoon op (idempotent). Volgorde respecteert FK's; cascades dekken de rest.
  // RecipeComponent heeft Restrict-FK's naar childRecipe/childVersion, dus de
  // org-cascade kan die recepten niet verwijderen zolang er component-links naar
  // wijzen. Verwijder daarom eerst álle component-koppelingen, dan pas de rest.
  await prisma.recipeComponent.deleteMany({});
  await prisma.organization.deleteMany({});
  // LlmUsageLog heeft geen FK naar Location (losstaande telemetrie), dus valt niet
  // onder de org-cascade — apart opruimen zodat de seed idempotent blijft.
  await prisma.llmUsageLog.deleteMany({});

  const org = await prisma.organization.create({ data: { name: "Bistro+ Holding" } });
  const location = await prisma.location.create({
    data: { orgId: org.id, name: "Bistro+ Den Bosch" },
  });

  // --- Gebruikers (credentials-auth) ---
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users = [
    { name: "Mark de Vries", email: "mark@bistroplus.nl", role: "EXEC_CHEF" as const },
    { name: "Eigenaar Bistro+", email: "owner@bistroplus.nl", role: "OWNER" as const },
    { name: "Chef de Partie", email: "chef@bistroplus.nl", role: "CHEF" as const },
  ];
  for (const u of users) {
    await prisma.user.create({
      data: { ...u, passwordHash, locationId: location.id },
    });
  }

  // --- Catalogus uit CSV ---
  const rows = loadCatalog();
  const catalogData = rows.map((r) => ({
    id: `${location.id}:${r.id}`,
    locationId: location.id,
    externalId: r.id,
    name: r.naam,
    category: r.categorie,
    supplier: toSupplier(r.leverancier),
    unit: r.eenheid,
    price: toPrice(r.prijs_eur),
  }));
  await prisma.catalogItem.createMany({ data: catalogData });
  await prisma.ingredientPrice.createMany({
    data: catalogData.map((c) => ({ catalogItemId: c.id, price: c.price, source: "seed" })),
  });
  console.log(`  ✓ ${catalogData.length} catalogus-artikelen + prijshistorie`);

  // --- Hoofdgerecht: Miso-Glazed Salmon met 3 versies ---
  const salmon = await prisma.recipe.create({
    data: {
      locationId: location.id,
      dish: "Miso-Glazed Salmon",
      category: "Seafood",
      menuPrice: "22.80",
      popularity: 240,
      favorite: true,
      isOnMenu: true,
    },
  });

  let activeVersionId: string | null = null;
  for (const v of SALMON_VERSIONS) {
    const created = await prisma.recipeVersion.create({
      data: {
        recipeId: salmon.id,
        label: v.label,
        name: v.name,
        note: v.note,
        prepTimeMin: v.prepTimeMin,
        steps: v.steps,
        ingredients: {
          create: v.ingredients.map((i) => ({
            name: i.name,
            amount: i.amount.toString(),
            unit: i.unit,
            mode: i.mode ?? CostMode.WEIGHT,
            pricePerUnit: i.price.toString(),
          })),
        },
      },
    });
    if (v.label === "v1.2") activeVersionId = created.id;
  }
  await prisma.recipe.update({ where: { id: salmon.id }, data: { activeVersionId } });

  // --- Overige menukaart (indicatieve foodcost-regel) ---
  for (const d of OTHER_DISHES) {
    const foodcost = (d.menuPrice * (1 - d.marginPct / 100)).toFixed(2);
    const recipe = await prisma.recipe.create({
      data: {
        locationId: location.id,
        dish: d.dish,
        category: d.category,
        menuPrice: d.menuPrice.toFixed(2),
        popularity: d.popularity,
        favorite: d.favorite,
        isOnMenu: true,
      },
    });
    const version = await prisma.recipeVersion.create({
      data: {
        recipeId: recipe.id,
        label: "v1.0",
        name: "Basis",
        note: "Indicatieve foodcost — detail-receptuur nog op te bouwen in de Recipe Lab.",
        prepTimeMin: 20,
        steps: [],
        ingredients: {
          create: [
            {
              name: "Samengestelde foodcost (indicatief)",
              amount: "1",
              unit: "portie",
              mode: CostMode.PIECE,
              pricePerUnit: foodcost,
            },
          ],
        },
      },
    });
    await prisma.recipe.update({ where: { id: recipe.id }, data: { activeVersionId: version.id } });
  }
  console.log(`  ✓ ${1 + OTHER_DISHES.length} gerechten (Miso-Glazed Salmon + menukaart)`);

  // --- HACCP-registratiepunten ---
  await prisma.haccpCheckpoint.createMany({
    data: HACCP_CHECKPOINTS.map((c) => ({
      locationId: location.id,
      zone: c.zone,
      target: c.target,
      limitValue: c.limitValue.toString(),
      cmp: c.cmp,
      unit: c.unit,
    })),
  });
  console.log(`  ✓ ${HACCP_CHECKPOINTS.length} HACCP-registratiepunten`);

  console.log("\n✅ Seed voltooid.");
  console.log(`   Organisatie : ${org.name}`);
  console.log(`   Locatie     : ${location.name} (${location.id})`);
  console.log(`   Login       : mark@bistroplus.nl / ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
