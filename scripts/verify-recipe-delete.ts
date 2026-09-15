// Verifieert de volledige cascade-verwijdering van een recept: version + ingrediënten
// moeten mee verdwijnen, en de FK Recipe.activeVersionId mag het niet blokkeren.
// Maakt een wegwerp-recept aan, voert exact de transactie van deleteRecipe uit en
// controleert dat alles weg is.
//
// npx tsx --env-file=.env scripts/verify-recipe-delete.ts

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const cs = process.env.DATABASE_URL;
const ssl = /sslmode=(require|no-verify)|supabase\.com/.test(cs ?? "") ? { rejectUnauthorized: false } : undefined;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: cs, ssl }) });

async function main() {
  const user = await prisma.user.findFirst({ select: { locationId: true } });
  if (!user) throw new Error("Geen gebruiker/locatie in de DB — draai eerst de seed.");

  // 1. Wegwerp-recept met versie (2 ingrediënten) en actieve versie.
  const recipe = await prisma.recipe.create({
    data: { locationId: user.locationId, dish: "__DELETE_TEST__", category: "Test", menuPrice: "10.00" },
  });
  const version = await prisma.recipeVersion.create({
    data: {
      recipeId: recipe.id,
      label: "v1.0",
      name: "Testversie",
      prepTimeMin: 5,
      steps: [],
      ingredients: {
        create: [
          { name: "Ingrediënt A", amount: "50", unit: "g", mode: "WEIGHT", pricePerUnit: "12.00" },
          { name: "Ingrediënt B", amount: "2", unit: "stuk", mode: "PIECE", pricePerUnit: "0.50" },
        ],
      },
    },
  });
  await prisma.recipe.update({ where: { id: recipe.id }, data: { activeVersionId: version.id } });

  const before = {
    recipe: await prisma.recipe.count({ where: { id: recipe.id } }),
    versions: await prisma.recipeVersion.count({ where: { recipeId: recipe.id } }),
    ingredients: await prisma.recipeIngredient.count({ where: { versionId: version.id } }),
  };
  console.log("Aangemaakt:", before, `(recipeId=${recipe.id}, versionId=${version.id})`);

  // 2. Exact de transactie van deleteRecipe.
  await prisma.$transaction([
    prisma.recipe.update({ where: { id: recipe.id }, data: { activeVersionId: null } }),
    prisma.recipe.delete({ where: { id: recipe.id } }),
  ]);

  // 3. Alles moet weg zijn.
  const after = {
    recipe: await prisma.recipe.count({ where: { id: recipe.id } }),
    versions: await prisma.recipeVersion.count({ where: { recipeId: recipe.id } }),
    ingredients: await prisma.recipeIngredient.count({ where: { versionId: version.id } }),
  };
  console.log("Na verwijderen:", after);

  const checks = [
    { label: "Recept verwijderd", pass: after.recipe === 0 },
    { label: "Receptversies verwijderd (cascade)", pass: after.versions === 0 },
    { label: "Ingrediënten verwijderd (cascade)", pass: after.ingredients === 0 },
  ];
  console.log("\nResultaten:");
  for (const c of checks) console.log(`  ${c.pass ? "✅" : "❌"} ${c.label}`);

  const allPass = checks.every((c) => c.pass);
  console.log(`\n${allPass ? "ALLE CHECKS GESLAAGD ✅" : "ER FAALDEN CHECKS ❌"}`);

  // Vangnet: als de delete faalde, ruim het wegwerp-recept alsnog op.
  if (after.recipe > 0) {
    await prisma.recipe.update({ where: { id: recipe.id }, data: { activeVersionId: null } });
    await prisma.recipe.delete({ where: { id: recipe.id } }).catch(() => {});
  }
  if (!allPass) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
