import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Prisma 7 vereist een driver-adapter voor een directe verbinding.
const connectionString = process.env.DATABASE_URL;

// Supabase pooler vereist TLS; in dev valideren we de cert-chain niet
// (pin de Supabase-CA in productie). Voor een lokale niet-SSL DB: geen ssl.
const ssl = /sslmode=(require|no-verify)|supabase\.com/.test(connectionString ?? "")
  ? { rejectUnauthorized: false }
  : undefined;

const adapter = new PrismaPg({ connectionString, ssl });

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
