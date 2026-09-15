// Verificatie van de twee follow-ups tegen de echte DB:
//  FU1: alleen-component-recepten verdwijnen uit menu-overzichten (getMenuOverview),
//       maar blijven bereikbaar via getLabRecipes (voor de componentkoppeling).
//  FU2: Chef Auguste's buildMenuContext gebruikt dezelfde component-inclusieve
//       kosten als Lab/Library (getVersionCostMap) — geen ingrediënt-only afwijking.
//
// npx tsx --env-file=.env scripts/verify-components-followups.ts

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMenuOverview } from "../src/server/menu";
import { getLabRecipes } from "../src/server/recipes";
import { getVersionCostMap } from "../src/server/recipe-cost-graph";
import { buildMenuContext, type CtxRecipe } from "../src/server/llm/chef";

const cs = process.env.DATABASE_URL;
const ssl = /supabase\.com/.test(cs ?? "") ? { rejectUnauthorized: false } : undefined;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: cs, ssl }) });

async function main() {
  const user = await prisma.user.findFirst({ select: { locationId: true } });
  if (!user) throw new Error("Geen gebruiker/locatie — draai eerst de seed.");
  const loc = user.locationId;
  const checks: { label: string; pass: boolean; detail?: string }[] = [];
  let childId = "", parentId = "", parentVerId = "";

  try {
    // Child: Pepersaus, ALLEEN-COMPONENT. €1,20/portie, yield 50 ml.
    const child = await prisma.recipe.create({
      data: { locationId: loc, dish: "__FU_CHILD__ Pepersaus", category: "Saus", menuPrice: "0.00", componentOnly: true },
    });
    childId = child.id;
    const childVer = await prisma.recipeVersion.create({
      data: {
        recipeId: child.id, label: "v1.0", name: "Basis", prepTimeMin: 10, steps: [],
        yieldQty: "50", yieldUnit: "ml", yieldMode: "WEIGHT",
        ingredients: { create: [{ name: "Peperkorrels", amount: "100", unit: "g", mode: "WEIGHT", pricePerUnit: "12.00" }] },
      },
    });
    await prisma.recipe.update({ where: { id: child.id }, data: { activeVersionId: childVer.id } });

    // Parent: Steak €30, geen eigen ingrediënten, gebruikt 50 ml saus.
    const parent = await prisma.recipe.create({
      data: { locationId: loc, dish: "__FU_PARENT__ Steak", category: "Vlees", menuPrice: "30.00" },
    });
    parentId = parent.id;
    const parentVer = await prisma.recipeVersion.create({
      data: { recipeId: parent.id, label: "v1.0", name: "Basis", prepTimeMin: 20, steps: [] },
    });
    parentVerId = parentVer.id;
    await prisma.recipe.update({ where: { id: parent.id }, data: { activeVersionId: parentVer.id } });
    await prisma.recipeComponent.create({
      data: { parentVersionId: parentVer.id, childRecipeId: child.id, childVersionId: childVer.id, amount: "50", unit: "ml", mode: "WEIGHT" },
    });

    // FU1: menu-overzicht bevat de parent, NIET de alleen-component child.
    const menu = await getMenuOverview(loc);
    checks.push({ label: "FU1: parent staat in het menu-overzicht", pass: menu.some((m) => m.id === parent.id) });
    checks.push({ label: "FU1: alleen-component child is UIT het menu-overzicht gefilterd", pass: !menu.some((m) => m.id === child.id) });

    // FU1: child blijft wél in getLabRecipes (bereikbaar via componentlink).
    const labs = await getLabRecipes(loc);
    const childLab = labs.find((r) => r.id === child.id);
    checks.push({ label: "FU1: child blijft beschikbaar in de Lab-data (via link)", pass: !!childLab && childLab.componentOnly === true });

    // FU2: chef buildMenuContext gebruikt dezelfde component-inclusieve kosten.
    const costMap = await getVersionCostMap(loc);
    const dbParent = await prisma.recipe.findUniqueOrThrow({
      where: { id: parent.id },
      include: { activeVersion: { include: { ingredients: true } }, versions: { select: { id: true, label: true, name: true } } },
    });
    const ctx: CtxRecipe = {
      id: dbParent.id,
      dish: dbParent.dish,
      category: dbParent.category,
      menuPrice: dbParent.menuPrice,
      popularity: dbParent.popularity,
      activeVersion: dbParent.activeVersion
        ? {
            id: dbParent.activeVersion.id,
            label: dbParent.activeVersion.label,
            name: dbParent.activeVersion.name,
            ingredients: dbParent.activeVersion.ingredients.map((i) => ({ name: i.name, amount: i.amount, unit: i.unit, mode: i.mode, pricePerUnit: i.pricePerUnit })),
          }
        : null,
      versions: dbParent.versions,
    };
    const [chefItem] = buildMenuContext([ctx], costMap);
    const menuItem = menu.find((m) => m.id === parent.id)!;

    checks.push({
      label: "FU2: chef-marge telt de component mee (96,0%, niet 100%)",
      pass: chefItem.marginPct === 96 && chefItem.foodcostPerCover === 1.2,
      detail: `chef marge=${chefItem.marginPct}% foodcost=${chefItem.foodcostPerCover}`,
    });
    checks.push({
      label: "FU2: chef-marge == Library/Matrix-marge (zelfde berekening)",
      pass: chefItem.marginPct === menuItem.marginPct && chefItem.foodcostPerCover === menuItem.foodcostPerCover,
      detail: `chef=${chefItem.marginPct}% library=${menuItem.marginPct}%`,
    });
  } finally {
    await prisma.recipeComponent.deleteMany({ where: { OR: [{ childRecipeId: childId }, { parentVersionId: parentVerId }] } }).catch(() => {});
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
