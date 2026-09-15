// Scenario-verificatie van de pairing-verrijking via de echte runChefTurn.
// Twee vragen:
//   A) niet-gecureerd ingrediënt (eendenlever) → inhoudelijk cular advies,
//      GEEN "weet ik niet" en GEEN verzonnen exacte affinity-score.
//   B) gecureerd ingrediënt (zalm) → mag wél naar onze affinity-data verwijzen.
//
// npx tsx --env-file=.env scripts/verify-chef-flavor.ts

import { prisma } from "../src/server/db";
import { runChefTurn } from "../src/server/llm/chef";

async function cleanup(locationId: string, userId: string) {
  const conv = await prisma.chefConversation.findFirst({
    where: { locationId, userId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (conv) {
    await prisma.chefMessage.deleteMany({ where: { conversationId: conv.id } });
    await prisma.chefConversation.delete({ where: { id: conv.id } });
  }
}

async function main() {
  const user = await prisma.user.findFirst({ select: { id: true, locationId: true, email: true } });
  if (!user) throw new Error("Geen gebruiker in de DB — draai eerst de seed.");
  const t = { locationId: user.locationId, userId: user.id };
  console.log(`Tenant: ${user.email}\n`);

  const checks: { label: string; pass: boolean; detail: string }[] = [];

  // A) Niet-gecureerd ingrediënt.
  const a = await runChefTurn({ ...t, message: "Waar past eendenlever qua smaak sterk bij? Noem een paar pairings met korte onderbouwing." });
  const at = a.text;
  console.log(`A) eendenlever →\n   ${at}\n`);
  checks.push({
    // Let op: "zit niet in onze data" is GEEN terugval maar juist de gewenste
    // bronscheiding. We vangen alleen een echte weigering (geen advies gegeven).
    label: "Eendenlever: geen echte 'weet ik niet'-weigering",
    pass: !/dat weet ik niet|\bweet ik (het )?niet\b|kan ik (je |u )?niet (helpen|zeggen|adviseren)|geen (idee|flauw benul|advies)/i.test(at),
    detail: "",
  });
  checks.push({
    label: "Eendenlever: inhoudelijk antwoord (noemt smaken/texturen)",
    pass: at.length > 120 && /(zuur|vet|zoet|umami|bitter|zout|textuur|smaak|aroma)/i.test(at),
    detail: `lengte=${at.length}`,
  });
  checks.push({
    label: "Eendenlever: GEEN verzonnen exacte affinity-score",
    pass: !/affinity[-\s]?score\s*[:=]?\s*\d/i.test(at),
    detail: "",
  });

  await cleanup(t.locationId, t.userId);

  // B) Gecureerd ingrediënt.
  const b = await runChefTurn({ ...t, message: "En zalm — wat zijn de sterkste smaakcombinaties volgens onze data?" });
  const bt = b.text;
  console.log(`B) zalm →\n   ${bt}\n`);
  checks.push({
    label: "Zalm: verwijst naar de gecureerde affinity-data (score/pairingnaam)",
    pass: /(affinity|score|\b9[0-6]\b|miso|dille|citroen|crème fraîche|sojasaus)/i.test(bt),
    detail: "",
  });

  await cleanup(t.locationId, t.userId);

  console.log("Resultaten:");
  for (const c of checks) console.log(`  ${c.pass ? "✅" : "❌"} ${c.label}${c.detail ? `  (${c.detail})` : ""}`);
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
