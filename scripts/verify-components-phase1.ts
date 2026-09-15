// Fase 1-verificatie (datamodel + query + delete-bescherming) tegen de echte DB.
// Maakt een child-recept (Pepersaus) en een parent, koppelt ze via RecipeComponent,
// en controleert: getLabRecipes levert de component + yield; yield-defaults kloppen;
// een als-component-gebruikt recept is beschermd (DB Restrict). Ruimt alles op.
//
// npx tsx --env-file=.env scripts/verify-components-phase1.ts

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { getLabRecipes } from "../src/server/recipes";

const cs = process.env.DATABASE_URL;
const ssl = /sslmode=(require|no-verify)|supabase\.com/.test(cs ?? "") ? { rejectUnauthorized: false } : undefined;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: cs, ssl }) });

async function main() {
  const user = await prisma.user.findFirst({ select: { locationId: true } });
  if (!user) throw new Error("Geen gebruiker/locatie — draai eerst de seed.");
  const loc = user.locationId;

  const checks: { label: string; pass: boolean; detail?: string }[] = [];
  let childId = "", parentId = "";

  try {
    // Child (Pepersaus) met versie; yield-velden op default laten.
    const child = await prisma.recipe.create({
      data: { locationId: loc, dish: "__COMP_CHILD__ Pepersaus", category: "Test", menuPrice: "0.00" },
    });
    childId = child.id;
    const childVer = await prisma.recipeVersion.create({
      data: { recipeId: child.id, label: "v1.0", name: "Basis", prepTimeMin: 10, steps: [] },
    });
    await prisma.recipe.update({ where: { id: child.id }, data: { activeVersionId: childVer.id } });

    // Parent met versie + component-link naar de child.
    const parent = await prisma.recipe.create({
      data: { locationId: loc, dish: "__COMP_PARENT__ Steak", category: "Test", menuPrice: "30.00" },
    });
    parentId = parent.id;
    const parentVer = await prisma.recipeVersion.create({
      data: { recipeId: parent.id, label: "v1.0", name: "Basis", prepTimeMin: 20, steps: [] },
    });
    await prisma.recipe.update({ where: { id: parent.id }, data: { activeVersionId: parentVer.id } });
    await prisma.recipeComponent.create({
      data: {
        parentVersionId: parentVer.id,
        childRecipeId: child.id,
        childVersionId: childVer.id,
        amount: "50",
        unit: "ml",
        mode: "WEIGHT",
      },
    });

    // 1. getLabRecipes levert de component + yield in de DTO.
    const recipes = await getLabRecipes(loc);
    const parentDto = recipes.find((r) => r.id === parent.id);
    const comp = parentDto?.versions[0]?.components[0];
    checks.push({
      label: "getLabRecipes levert de component in de parent-versie",
      pass:
        !!comp &&
        comp.childRecipeId === child.id &&
        comp.childVersionId === childVer.id &&
        comp.name.includes("Pepersaus") &&
        comp.versionLabel === "v1.0" &&
        comp.amount === "50" &&
        comp.unit === "ml" &&
        comp.mode === "WEIGHT" &&
        comp.childActiveVersionId === childVer.id,
      detail: JSON.stringify(comp),
    });

    // 2. Yield-defaults kloppen (backwards compatible: 1 portie / PIECE).
    const childDto = recipes.find((r) => r.id === child.id);
    const cv = childDto?.versions[0];
    checks.push({
      label: "Yield-defaults: 1 portie / PIECE",
      pass: cv?.yieldQty === "1" && cv?.yieldUnit === "portie" && cv?.yieldMode === "PIECE",
      detail: `yieldQty=${cv?.yieldQty} unit=${cv?.yieldUnit} mode=${cv?.yieldMode}`,
    });

    // 3. Precheck-query vindt het parent-gerecht waarin de child wordt gebruikt.
    const usedIn = await prisma.recipeComponent.findMany({
      where: { childRecipeId: child.id },
      select: { parentVersion: { select: { recipe: { select: { dish: true } } } } },
    });
    checks.push({
      label: "Delete-precheck ziet dat de child als component gebruikt wordt",
      pass: usedIn.some((u) => u.parentVersion.recipe.dish.includes("Steak")),
      detail: `usedIn=${usedIn.length}`,
    });

    // 4. DB-bescherming: child (gepind als childVersion) verwijderen faalt (Restrict).
    let restricted = false;
    try {
      await prisma.recipe.update({ where: { id: child.id }, data: { activeVersionId: null } });
      await prisma.recipe.delete({ where: { id: child.id } });
    } catch {
      restricted = true;
    }
    checks.push({ label: "DB blokkeert verwijderen van een gebruikte component (Restrict)", pass: restricted });
  } finally {
    // Opruimen in de juiste volgorde: eerst de links, dan parent, dan child.
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
