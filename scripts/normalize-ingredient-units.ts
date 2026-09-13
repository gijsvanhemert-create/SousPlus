// Eenmalige migratie: normaliseer de opslag-eenheid van bestaande WEIGHT-
// ingrediënten naar g/ml. Achtergrond: Chef Auguste nam eerder de catalogus-
// eenheid (kg/L) klakkeloos over als opslag-eenheid, wat leidde tot rijen als
// "Maatjesharing 80 kg" per couvert. De hoeveelheid (amount) is per contract al
// grammen/ml en blijft ONGEMOEID; alleen het foute eenheidslabel wordt hersteld.
// De kostprijs verandert niet (de motor deelt WEIGHT sowieso door 1000).
//
// Draaien:  npx tsx --env-file=.env scripts/normalize-ingredient-units.ts
//   voeg --dry toe voor een preview zonder te schrijven.

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { CostMode } from "../src/generated/prisma/enums";
import { normalizeWeightUnit, isNormalizedWeightUnit } from "../src/lib/units";

const connectionString = process.env.DATABASE_URL;
const ssl = /sslmode=(require|no-verify)|supabase\.com/.test(connectionString ?? "")
  ? { rejectUnauthorized: false }
  : undefined;
const adapter = new PrismaPg({ connectionString, ssl });
const prisma = new PrismaClient({ adapter });

async function main() {
  const dryRun = process.argv.includes("--dry");

  const rows = await prisma.recipeIngredient.findMany({
    where: { mode: CostMode.WEIGHT },
    select: { id: true, name: true, amount: true, unit: true },
  });

  const bad = rows.filter((r) => !isNormalizedWeightUnit(r.unit));
  if (bad.length === 0) {
    console.log("Geen WEIGHT-ingrediënten met een niet-genormaliseerde eenheid. Niets te doen.");
    return;
  }

  console.log(`${bad.length} ingrediënt(en) worden ${dryRun ? "(dry-run) " : ""}genormaliseerd:`);
  for (const r of bad) {
    const to = normalizeWeightUnit(r.unit);
    console.log(`  • ${r.name}: ${r.amount} ${r.unit} → ${r.amount} ${to}`);
  }

  if (dryRun) {
    console.log("\nDry-run: er is niets weggeschreven. Draai zonder --dry om toe te passen.");
    return;
  }

  let updated = 0;
  for (const r of bad) {
    await prisma.recipeIngredient.update({
      where: { id: r.id },
      data: { unit: normalizeWeightUnit(r.unit) },
    });
    updated++;
  }
  console.log(`\nKlaar: ${updated} ingrediënt(en) genormaliseerd.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
