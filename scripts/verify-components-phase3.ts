// Fase 3-verificatie tegen de echte DB: component-kosten tellen door in de
// resolver én in het menu-overzicht (Library/Matrix), en de server-side cyclus/
// self-validatie werkt. Maakt Pepersaus (child) + Steak (parent), koppelt ze, en
// controleert de doorgerekende marge. Ruimt alles op.
//
// npx tsx --env-file=.env scripts/verify-components-phase3.ts

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { getVersionCostMap, assertComponentAllowed } from "../src/server/recipe-cost-graph";
import { getMenuOverview } from "../src/server/menu";
import { getLabRecipes } from "../src/server/recipes";

const cs = process.env.DATABASE_URL;
const ssl = /supabase\.com/.test(cs ?? "") ? { rejectUnauthorized: false } : undefined;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: cs, ssl }) });

async function main() {
  const user = await prisma.user.findFirst({ select: { locationId: true } });
  if (!user) throw new Error("Geen gebruiker/locatie — draai eerst de seed.");
  const loc = user.locationId;
  const checks: { label: string; pass: boolean; detail?: string }[] = [];
  let childId = "", parentId = "";

  try {
    // Child: Pepersaus — 100 g peperkorrels @ €12/kg = €1,20/portie; yield 50 ml.
    const child = await prisma.recipe.create({
      data: { locationId: loc, dish: "__P3_CHILD__ Pepersaus", category: "Test", menuPrice: "0.00" },
    });
    childId = child.id;
    const childVer = await prisma.recipeVersion.create({
      data: {
        recipeId: child.id,
        label: "v1.0",
        name: "Basis",
        prepTimeMin: 10,
        steps: [],
        yieldQty: "50",
        yieldUnit: "ml",
        yieldMode: "WEIGHT",
        ingredients: { create: [{ name: "Peperkorrels", amount: "100", unit: "g", mode: "WEIGHT", pricePerUnit: "12.00" }] },
      },
    });
    await prisma.recipe.update({ where: { id: child.id }, data: { activeVersionId: childVer.id } });

    // Parent: Steak — €30 menuprijs, geen eigen ingrediënten, gebruikt 50 ml saus.
    const parent = await prisma.recipe.create({
      data: { locationId: loc, dish: "__P3_PARENT__ Steak", category: "Test", menuPrice: "30.00" },
    });
    parentId = parent.id;
    const parentVer = await prisma.recipeVersion.create({
      data: { recipeId: parent.id, label: "v1.0", name: "Basis", prepTimeMin: 20, steps: [] },
    });
    await prisma.recipe.update({ where: { id: parent.id }, data: { activeVersionId: parentVer.id } });
    await prisma.recipeComponent.create({
      data: { parentVersionId: parentVer.id, childRecipeId: child.id, childVersionId: childVer.id, amount: "50", unit: "ml", mode: "WEIGHT" },
    });

    // 1. Resolver: parent-versie foodcost = 50 × (1,20/50) = €1,20.
    const costMap = await getVersionCostMap(loc);
    const parentFc = costMap.get(parentVer.id)?.foodcostPerServing.toString();
    checks.push({ label: "Resolver telt component door in parent-foodcost (€1,20)", pass: parentFc === "1.2", detail: `foodcost=${parentFc}` });

    // 2. Menu-overzicht (Library/Matrix): marge = (30 − 1,20)/30 = 96,0%.
    const menu = await getMenuOverview(loc);
    const parentItem = menu.find((m) => m.id === parent.id);
    checks.push({
      label: "Menu-overzicht rekent de component mee in de marge (96,0%)",
      pass: parentItem?.marginPct === 96 && parentItem?.foodcostPerCover === 1.2,
      detail: `marge=${parentItem?.marginPct}% foodcost=${parentItem?.foodcostPerCover}`,
    });

    // 3. getLabRecipes levert de component voor de UI.
    const labs = await getLabRecipes(loc);
    const comp = labs.find((r) => r.id === parent.id)?.versions[0]?.components[0];
    checks.push({ label: "getLabRecipes levert de component in de parent-versie", pass: comp?.childRecipeId === child.id && comp?.amount === "50", detail: JSON.stringify(comp) });

    // 4. Cyclus-validatie: child → parent toevoegen moet falen (parent → child bestaat al).
    let cycleBlocked = false;
    try {
      await assertComponentAllowed(loc, child.id, parent.id);
    } catch {
      cycleBlocked = true;
    }
    checks.push({ label: "assertComponentAllowed blokkeert een cyclus (child→parent)", pass: cycleBlocked });

    // 5. Self-referentie moet falen.
    let selfBlocked = false;
    try {
      await assertComponentAllowed(loc, parent.id, parent.id);
    } catch {
      selfBlocked = true;
    }
    checks.push({ label: "assertComponentAllowed blokkeert self-referentie", pass: selfBlocked });

    // 6. Een geldige nieuwe koppeling (parent → child) mag juist WEL.
    let allowed = true;
    try {
      await assertComponentAllowed(loc, parent.id, child.id);
    } catch {
      allowed = false;
    }
    checks.push({ label: "assertComponentAllowed staat een geldige koppeling toe", pass: allowed });
  } finally {
    await prisma.recipeComponent.deleteMany({ where: { OR: [{ childRecipeId: childId }, { parentVersion: { recipeId: parentId } }] } }).catch(() => {});
    for (const id of [parentId, childId].filter(Boolean)) {
      await prisma.recipe.update({ where: { id }, data: { activeVersionId: null } }).catch(() => {});
      await prisma.recipe.delete({ where: { id } }).catch(() => {});
    }
  }

  console.log("Resultaten:");
  for (const c of checks) console.log(`  ${c.pass ? "✅" : "❌"} ${c.label}${c.detail ? `\n       ${c.detail}` : ""}`);
  const allPass = checks.every((c) => c.pass);
  console.log(`\n${allPass ? "ALLE CHECKS GESLAAGD ✅" : "ER FAALDEN CHECKS ❌"}`);
  if (!allPass) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
