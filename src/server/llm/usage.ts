import { prisma } from "@/server/db";
import type { Tier } from "./config";
import type { LlmUsage } from "./types";

// Persisteert AI-tokenverbruik per aanroep in LlmUsageLog. Bewust "best effort":
// telemetrie mag een AI-aanroep NOOIT laten falen, dus alle fouten (bv. een
// tijdelijk databaseprobleem) worden opgevangen en alleen gelogd.
export async function logLlmUsage(entry: {
  locationId: string;
  model: string;
  tier: Tier;
  action: string;
  usage: LlmUsage;
}): Promise<void> {
  try {
    await prisma.llmUsageLog.create({
      data: {
        locationId: entry.locationId,
        model: entry.model,
        tier: entry.tier,
        action: entry.action,
        inputTokens: entry.usage.inputTokens,
        outputTokens: entry.usage.outputTokens,
        cacheCreationTokens: entry.usage.cacheCreationInputTokens ?? 0,
        cacheReadTokens: entry.usage.cacheReadInputTokens ?? 0,
      },
    });
  } catch (err) {
    console.warn(
      JSON.stringify({ at: "llm.usage.logFailed", model: entry.model, tier: entry.tier, action: entry.action }),
      err,
    );
  }
}
