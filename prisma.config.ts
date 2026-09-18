import path from "node:path";
import { defineConfig } from "prisma/config";

// Prisma 7 laadt .env niet meer automatisch wanneer er een prisma.config.ts is.
// Node 24 heeft process.loadEnvFile ingebouwd.
try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // .env ontbreekt (bv. in CI met echte env-vars) — geen probleem.
}

// Connection-URL voor Prisma Migrate/db push/seed (Prisma 7 verplaatste dit uit
// het schema). Bewust GEEN env("DATABASE_URL"): die helper gooit meteen als de
// var ontbreekt, en prisma.config.ts wordt óók geladen door `prisma generate` —
// dat draait als postinstall bij élke Vercel-build, waar geen DB-URL beschikbaar
// hoeft te zijn. generate heeft de datasource niet nodig (die is alleen vereist
// voor migratie/introspectie), dus laten we 'm weg als er geen URL is.
// DIRECT_URL gaat vóór: dat is de directe/session-verbinding voor DDL (push/seed);
// de transaction-pooler-DATABASE_URL is bedoeld voor de serverless-runtime.
const migrateUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  ...(migrateUrl ? { datasource: { url: migrateUrl } } : {}),
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
