import path from "node:path";
import { defineConfig, env } from "prisma/config";

// Prisma 7 laadt .env niet meer automatisch wanneer er een prisma.config.ts is.
// Node 24 heeft process.loadEnvFile ingebouwd.
try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // .env ontbreekt (bv. in CI met echte env-vars) — geen probleem.
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  // Connection-URL voor Prisma Migrate (Prisma 7 verplaatste dit uit het schema).
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
