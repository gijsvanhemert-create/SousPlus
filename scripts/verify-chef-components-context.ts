// Verifieert de components-context van Chef Auguste tegen de ECHTE DB + een ECHTE
// modelrun (geen mock). Seed: een verkoopbaar ouder-gerecht + een alleen-component
// sub-recept dat eraan gekoppeld is. Checkt:
//   (a) het componentOnly-recept staat in context.components, NIET in context.menu
//   (b) het verkoopbare recept staat in context.menu, NIET in context.components
//   (c) modelrun: Auguste bewerkt het component op verzoek — update_recipe_version
//       vuurt op het juiste versionId (bewijs: de stappen in de DB veranderen én er
//       is een recipe-actie naar het component). Het oude "ik heb hier geen
//       recipeId's voor" mag niet meer optreden.
//   (d) modelrun: bij een algemeen menu-/marge-overzicht noemt Auguste het component
//       NIET als los verkoopbaar gerecht.
// Ruimt alles op.
//   npx tsx --env-file=.env scripts/verify-chef-components-context.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { buildContext, runChefTurn } from "../src/server/llm/chef";
import { hasApiKey } from "../src/server/llm/config";

const cs = process.env.DATABASE_URL;
const ssl = /supabase\.com/.test(cs ?? "") ? { rejectUnauthorized: false } : undefined;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: cs, ssl }) });

const PARENT = "__CTXTEST__ Prei du Soleil";
const CHILD = "__CTXTEST__ Prei-as Crumble";
const ORIGINAL_STEPS = ["Rooster de prei tot as.", "Meng met paneermeel.", "Droog in de oven."];

type Check = { label: string; pass: boolean; detail?: string };

async function main() {
  if (!hasApiKey()) {
    throw new Error(
      "ANTHROPIC_API_KEY ontbreekt — dit is een ECHTE modelrun-verificatie, geen mock. Zet de sleutel en draai opnieuw.",
    );
  }

  const user = await prisma.user.findFirst({ select: { id: true, locationId: true } });
  if (!user) throw new Error("Geen gebruiker — draai de seed.");
  const loc = user.locationId;
  const checks: Check[] = [];
  const created: string[] = [];
  let convId: string | null = null;

  try {
    // --- Seed: ouder-gerecht (verkoopbaar) ---
    const parent = await prisma.recipe.create({
      data: { locationId: loc, dish: PARENT, category: "Groente", menuPrice: "24.00", isOnMenu: true },
    });
    created.push(parent.id);
    const parentV = await prisma.recipeVersion.create({
      data: { recipeId: parent.id, label: "v1.0", name: "Basis", prepTimeMin: 30, steps: ["Gril de prei.", "Dresseer op bord."] },
    });
    await prisma.recipe.update({ where: { id: parent.id }, data: { activeVersionId: parentV.id } });

    // --- Seed: alleen-component sub-recept, gekoppeld aan de ouder ---
    const child = await prisma.recipe.create({
      data: { locationId: loc, dish: CHILD, category: "Component", menuPrice: "0.00", isOnMenu: false, componentOnly: true },
    });
    created.push(child.id);
    const childV = await prisma.recipeVersion.create({
      data: { recipeId: child.id, label: "v1.0", name: "Basis", prepTimeMin: 20, steps: [...ORIGINAL_STEPS] },
    });
    await prisma.recipe.update({ where: { id: child.id }, data: { activeVersionId: childV.id } });
    await prisma.recipeComponent.create({
      data: { parentVersionId: parentV.id, childRecipeId: child.id, childVersionId: childV.id, amount: "15", unit: "g", mode: "WEIGHT" },
    });

    // === (a)/(b) Context-splitsing — deterministisch, geen model nodig ===
    const ctx = (await buildContext(loc)) as {
      menu: { recipeId: string; dish: string }[];
      components: { recipeId: string; dish: string; usedIn: string[]; activeVersion: { id: string } | null }[];
    };
    const compEntry = ctx.components.find((c) => c.recipeId === child.id);
    const inMenu = ctx.menu.some((m) => m.recipeId === child.id);
    checks.push({
      label: "(a) componentOnly-recept staat in context.components, NIET in context.menu",
      pass: !!compEntry && !inMenu,
      detail: `inComponents=${!!compEntry} inMenu=${inMenu} usedIn=${JSON.stringify(compEntry?.usedIn)}`,
    });

    const parentInMenu = ctx.menu.some((m) => m.recipeId === parent.id);
    const parentInComponents = ctx.components.some((c) => c.recipeId === parent.id);
    checks.push({
      label: "(b) verkoopbaar recept staat in context.menu, NIET in context.components",
      pass: parentInMenu && !parentInComponents,
      detail: `inMenu=${parentInMenu} inComponents=${parentInComponents}`,
    });

    // === (c) ECHTE modelrun: Auguste bewerkt het component ===
    // Frisse conversatie zodat er geen oude historie meespeelt.
    const runC = await runChefTurn({
      locationId: loc,
      userId: user.id,
      autoConfirm: true, // update_recipe_version vraagt normaal bevestiging; hier direct uitvoeren
      message: `Voeg in het sub-recept "${CHILD}" bovenaan de bereidingsstappen de kop "— Prei-as Crumble —" toe en laat de bestaande stappen daaronder staan. Werk dit component bij.`,
    });
    convId = runC.conversationId;
    const editedChild = await prisma.recipeVersion.findUnique({ where: { id: childV.id }, select: { steps: true } });
    const stepsChanged = JSON.stringify(editedChild?.steps) !== JSON.stringify(ORIGINAL_STEPS);
    const firedRecipeAction = runC.actions.some((a) => a.kind === "recipe" && (a.href ?? "").includes(child.id));
    const headingPresent = (editedChild?.steps ?? []).some((s) => /prei-?as crumble/i.test(s));
    checks.push({
      label: "(c) modelrun: component bewerkt via update_recipe_version op het juiste versionId (geen 'geen recipeId'-scenario meer)",
      pass: stepsChanged && firedRecipeAction,
      detail: `stepsChanged=${stepsChanged} recipeActionNaarComponent=${firedRecipeAction} kopAanwezig=${headingPresent}\n       nieuwe stappen: ${JSON.stringify(editedChild?.steps)}\n       antwoord: ${runC.text.slice(0, 160).replace(/\n/g, " ")}`,
    });

    // === (d) ECHTE modelrun: algemeen menu-/marge-overzicht ===
    const runD = await runChefTurn({
      locationId: loc,
      userId: user.id,
      message: "Geef een kort overzicht van de gerechten op het menu met hun marge. Alleen analyse, geen actie.",
    });
    // Het component mag NIET als los gerecht opduiken in het menu-overzicht.
    const mentionsComponentAsDish = runD.text.includes(CHILD) || runD.text.toLowerCase().includes("prei-as crumble");
    const noActionForComponent = !runD.actions.some((a) => (a.href ?? "").includes(child.id));
    checks.push({
      label: "(d) modelrun: component NIET voorgesteld/vermeld als los verkoopbaar gerecht in de margeanalyse",
      pass: !mentionsComponentAsDish && noActionForComponent,
      detail: `noemtComponentAlsGerecht=${mentionsComponentAsDish} geenActieNaarComponent=${noActionForComponent}\n       antwoord: ${runD.text.slice(0, 200).replace(/\n/g, " ")}`,
    });
  } finally {
    // Opruimen: conversatie(s) van deze user, component-links, dan de recepten.
    const convs = await prisma.chefConversation.findMany({ where: { locationId: loc, userId: user.id }, select: { id: true } });
    for (const c of convs) {
      await prisma.chefMessage.deleteMany({ where: { conversationId: c.id } }).catch(() => {});
    }
    if (convId) await prisma.chefConversation.delete({ where: { id: convId } }).catch(() => {});
    for (const id of created) {
      await prisma.recipeComponent.deleteMany({ where: { OR: [{ childRecipeId: id }, { parentVersion: { recipeId: id } }] } }).catch(() => {});
    }
    for (const id of created) {
      await prisma.recipe.update({ where: { id }, data: { activeVersionId: null } }).catch(() => {});
      await prisma.recipe.delete({ where: { id } }).catch(() => {});
    }
  }

  console.log("Resultaten (echte modelrun):");
  for (const c of checks) console.log(`  ${c.pass ? "✅" : "❌"} ${c.label}${c.detail ? `\n       ${c.detail}` : ""}`);
  const allPass = checks.every((c) => c.pass);
  console.log(`\n${allPass ? "ALLE CHECKS GESLAAGD ✅" : "ER FAALDEN CHECKS ❌"}`);
  if (!allPass) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
