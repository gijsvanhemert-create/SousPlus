// Verifieert dat Chef Auguste componenten kan koppelen via de tools, tegen de
// echte DB: (1) save_recipe_version met asComponentOf maakt een recept én koppelt
// het als component (auto-mark), (2) link_component koppelt een bestaand recept,
// (3) een mislukte koppeling rolt een net aangemaakt recept terug, (4) een cyclus
// wordt geweigerd. Ruimt alles op.
// npx tsx --env-file=.env scripts/verify-chef-link-component.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { TOOL_BY_NAME } from "../src/server/llm/tools";

const cs = process.env.DATABASE_URL;
const ssl = /supabase\.com/.test(cs ?? "") ? { rejectUnauthorized: false } : undefined;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: cs, ssl }) });

const save = TOOL_BY_NAME.get("save_recipe_version")!;
const link = TOOL_BY_NAME.get("link_component")!;

async function makeRecipe(loc: string, dish: string, withActive = true) {
  const r = await prisma.recipe.create({ data: { locationId: loc, dish, category: "Test", menuPrice: "20.00" } });
  if (withActive) {
    const v = await prisma.recipeVersion.create({ data: { recipeId: r.id, label: "v1.0", name: "Basis", prepTimeMin: 5, steps: [] } });
    await prisma.recipe.update({ where: { id: r.id }, data: { activeVersionId: v.id } });
  }
  return r.id;
}

async function main() {
  const user = await prisma.user.findFirst({ select: { id: true, locationId: true } });
  if (!user) throw new Error("Geen gebruiker — draai de seed.");
  const loc = user.locationId;
  const ctx = { locationId: loc, userId: user.id };
  const checks: { label: string; pass: boolean; detail?: string }[] = [];
  const created: string[] = [];

  try {
    const parentId = await makeRecipe(loc, "__LINK_PARENT__ Fondant");
    created.push(parentId);

    // 1. save_recipe_version + asComponentOf: nieuw recept + koppelen + auto-mark.
    await save.execute(
      { name: "Chocoladesaus v1", dish: "__LINK_CHILD__ Chocoladesaus", category: "Saus", ingredients: [{ name: "Chocolade", g: 40, p: 12, mode: "weight" }], asComponentOf: { parentRecipeId: parentId } },
      ctx,
    );
    const child = await prisma.recipe.findFirst({ where: { locationId: loc, dish: "__LINK_CHILD__ Chocoladesaus" }, select: { id: true, componentOnly: true, isOnMenu: true } });
    if (child) created.push(child.id);
    const comp1 = child ? await prisma.recipeComponent.findFirst({ where: { childRecipeId: child.id } }) : null;
    checks.push({
      label: "save_recipe_version(asComponentOf): recept aangemaakt, gekoppeld én alleen-component",
      pass: !!child && !!comp1 && child.componentOnly === true && child.isOnMenu === false,
      detail: `child=${!!child} comp=${!!comp1} componentOnly=${child?.componentOnly} isOnMenu=${child?.isOnMenu}`,
    });

    // 2. link_component: bestaand los recept alsnog koppelen.
    const standaloneId = await makeRecipe(loc, "__LINK_STANDALONE__ Kletskop");
    created.push(standaloneId);
    await link.execute({ parentRecipeId: parentId, childRecipeId: standaloneId }, ctx);
    const comp2 = await prisma.recipeComponent.findFirst({ where: { childRecipeId: standaloneId } });
    const s2 = await prisma.recipe.findUnique({ where: { id: standaloneId }, select: { componentOnly: true } });
    checks.push({
      label: "link_component: bestaand recept gekoppeld + alleen-component gemarkeerd",
      pass: !!comp2 && s2?.componentOnly === true,
      detail: `comp=${!!comp2} componentOnly=${s2?.componentOnly}`,
    });

    // 3. Rollback: koppelen aan een ouder ZONDER actieve versie faalt; het net
    //    aangemaakte recept mag niet achterblijven.
    const noActiveParent = await makeRecipe(loc, "__LINK_NOACTIVE__ Parent", false);
    created.push(noActiveParent);
    let rolledBack = false;
    try {
      await save.execute({ name: "Weesje v1", dish: "__LINK_ORPHAN__ Weesje", category: "Saus", asComponentOf: { parentRecipeId: noActiveParent } }, ctx);
    } catch {
      const orphan = await prisma.recipe.findFirst({ where: { locationId: loc, dish: "__LINK_ORPHAN__ Weesje" }, select: { id: true } });
      rolledBack = !orphan; // geen los recept blijven staan
      if (orphan) created.push(orphan.id);
    }
    checks.push({ label: "Mislukte koppeling rolt het nieuw aangemaakte recept terug", pass: rolledBack });

    // 4. Cyclus geweigerd: child is component van parent → parent als component van
    //    child koppelen moet falen.
    let cycleBlocked = false;
    if (child) {
      try {
        await link.execute({ parentRecipeId: child.id, childRecipeId: parentId }, ctx);
      } catch {
        cycleBlocked = true;
      }
    }
    checks.push({ label: "link_component weigert een cyclus", pass: cycleBlocked });
  } finally {
    // Opruimen: eerst alle component-links van/naar de testrecepten, dan de recepten.
    for (const id of created) {
      await prisma.recipeComponent.deleteMany({ where: { OR: [{ childRecipeId: id }, { parentVersion: { recipeId: id } }] } }).catch(() => {});
    }
    for (const id of created) {
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

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
