// End-to-end verificatie van de update_recipe_version-fix via de ECHTE
// runChefTurn (dezelfde functie die /api/chef aanroept): echte buildContext,
// echte DB, echte tool-loop, echte MockAdapter (de app draait zonder API-key).
// Als de context de versie-id's niet zou bevatten, kan de mock geen id vinden en
// faalt de tool — dus dit test precies de fix.
//
// npx tsx --env-file=.env scripts/verify-chef-update.ts

import { prisma } from "../src/server/db";
import { runChefTurn } from "../src/server/llm/chef";

function euro(n: unknown) {
  return `€${Number(n).toFixed(2)}`;
}

async function main() {
  const user = await prisma.user.findFirst({ select: { id: true, locationId: true, email: true } });
  if (!user) throw new Error("Geen gebruiker in de DB — draai eerst de seed.");

  const recipe = await prisma.recipe.findFirst({
    where: { locationId: user.locationId, dish: { contains: "Salmon", mode: "insensitive" } },
    include: { activeVersion: { select: { id: true, label: true } } },
  });
  if (!recipe?.activeVersion) throw new Error("Miso-Glazed Salmon met actieve versie niet gevonden.");

  const originalPrice = recipe.menuPrice.toString();
  const target = 24.5;
  const msg = `Verhoog de menuprijs van ${recipe.dish} naar ${target}`;

  console.log(`Tenant       : ${user.email} (loc=${user.locationId})`);
  console.log(`Recept       : ${recipe.dish}  recipeId=${recipe.id}`);
  console.log(`Actieve versie: ${recipe.activeVersion.label} (${recipe.activeVersion.id})`);
  console.log(`Menuprijs nu : ${euro(originalPrice)}  →  doel ${euro(target)}\n`);

  const checks: { label: string; pass: boolean; detail: string }[] = [];

  // 1. Zonder autoConfirm: destructieve actie moet op bevestiging wachten.
  const step1 = await runChefTurn({ locationId: user.locationId, userId: user.id, message: msg });
  checks.push({
    label: "Vraagt bevestiging voor update_recipe_version",
    pass: step1.pendingConfirmation?.tool === "update_recipe_version",
    detail: `pendingConfirmation=${JSON.stringify(step1.pendingConfirmation)}`,
  });

  // 2. Met autoConfirm: voert de update uit en biedt een knop naar het JUISTE
  //    recept — zonder automatisch weg te navigeren.
  const step2 = await runChefTurn({ locationId: user.locationId, userId: user.id, message: msg, autoConfirm: true });
  checks.push({
    label: "Navigeert NIET automatisch weg",
    pass: step2.navigateTo === undefined,
    detail: `navigateTo=${step2.navigateTo}`,
  });
  checks.push({
    label: "Biedt een knop naar het specifieke recept in de Lab",
    pass: step2.actions.some((a) => a.href === `/lab?recipe=${recipe.id}`),
    detail: `actions=${JSON.stringify(step2.actions)}`,
  });
  checks.push({
    label: "Rapporteert geen foutmelding / geen handmatige terugval",
    pass: !/handmatig|niet.*(gevonden|koppelbaar)|lukt.*niet/i.test(step2.text),
    detail: `text="${step2.text}"`,
  });

  // 3. De DB is daadwerkelijk gewijzigd (bron van waarheid).
  const after = await prisma.recipe.findUnique({ where: { id: recipe.id }, select: { menuPrice: true } });
  checks.push({
    label: "Menuprijs in de database is bijgewerkt",
    pass: Number(after?.menuPrice) === target,
    detail: `db menuPrice=${euro(after?.menuPrice)}`,
  });

  console.log("Resultaten:");
  for (const c of checks) console.log(`  ${c.pass ? "✅" : "❌"} ${c.label}\n       ${c.detail}`);

  // Opruimen: prijs herstellen en de door de verificatie aangemaakte conversatie
  // + berichten verwijderen, zodat de demo-DB schoon blijft.
  await prisma.recipe.update({ where: { id: recipe.id }, data: { menuPrice: originalPrice } });
  const conv = await prisma.chefConversation.findFirst({
    where: { locationId: user.locationId, userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (conv) {
    await prisma.chefMessage.deleteMany({ where: { conversationId: conv.id } });
    await prisma.chefConversation.delete({ where: { id: conv.id } });
  }
  console.log(`\nOpgeruimd: menuprijs hersteld naar ${euro(originalPrice)}, verificatie-conversatie verwijderd.`);

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
