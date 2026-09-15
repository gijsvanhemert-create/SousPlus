// Verifieert dat runChefTurn tekst geleidelijk streamt (deltas druppelen binnen
// vóór het antwoord klaar is), i.p.v. alles aan het eind. Toont de eerste paar
// deltas met tijdstip. npx tsx --env-file=.env scripts/verify-chef-stream.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { runChefTurn } from "../src/server/llm/chef";

const cs = process.env.DATABASE_URL;
const ssl = /supabase\.com/.test(cs ?? "") ? { rejectUnauthorized: false } : undefined;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: cs, ssl }) });

async function main() {
  const user = await prisma.user.findFirst({ select: { id: true, locationId: true } });
  if (!user) throw new Error("Geen gebruiker — draai de seed.");

  const start = performance.now();
  let firstDeltaMs = -1;
  let deltas = 0;
  let streamed = "";
  const sampleTimes: number[] = [];

  const result = await runChefTurn({
    locationId: user.locationId,
    userId: user.id,
    message: "Wat is de marge van de Miso-Glazed Salmon? Korte analyse, geen actie.",
    onText: (d) => {
      const t = Math.round(performance.now() - start);
      if (firstDeltaMs < 0) firstDeltaMs = t;
      deltas += 1;
      streamed += d;
      if (sampleTimes.length < 6) sampleTimes.push(t);
    },
  });
  const totalMs = Math.round(performance.now() - start);

  console.log("Eerste delta na:", firstDeltaMs, "ms");
  console.log("Totaal klaar na:", totalMs, "ms");
  console.log("Aantal deltas:", deltas, "| tijdstippen eerste deltas (ms):", sampleTimes.join(", "));
  console.log("Gestreamde tekst == eindtekst:", streamed.trim() === result.text.trim());
  console.log("Fragment:", streamed.slice(0, 80).replace(/\n/g, " "), "…");

  const checks = [
    { label: "Deltas arriveren (streaming actief)", pass: deltas > 1 },
    { label: "Eerste delta ruim vóór voltooiing (geen lump aan het eind)", pass: firstDeltaMs >= 0 && firstDeltaMs < totalMs * 0.8 },
    { label: "Gestreamde tekst matcht het eindantwoord", pass: streamed.trim() === result.text.trim() },
  ];
  console.log("\nResultaten:");
  for (const c of checks) console.log(`  ${c.pass ? "✅" : "❌"} ${c.label}`);

  // Opruimen.
  const conv = await prisma.chefConversation.findFirst({ where: { locationId: user.locationId, userId: user.id }, orderBy: { createdAt: "desc" }, select: { id: true } });
  if (conv) {
    await prisma.chefMessage.deleteMany({ where: { conversationId: conv.id } });
    await prisma.chefConversation.delete({ where: { id: conv.id } });
  }
  console.log(`\n${checks.every((c) => c.pass) ? "ALLE CHECKS GESLAAGD ✅" : "ER FAALDEN CHECKS ❌"}`);
  if (!checks.every((c) => c.pass)) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
