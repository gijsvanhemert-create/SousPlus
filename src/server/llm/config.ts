// Model-agnostische routerconfiguratie. Modelnamen staan in env/config — nooit
// hardcoded in de aanroepende code. Vastgestelde keuzes (door de gebruiker):
//   Tier 1 (volume/goedkoop: OCR-extractie, classificatie) → Claude Haiku
//   Tier 2 (advies, tool-use, gestructureerde output: Chef Auguste) → Claude Sonnet
// LLM draait nu op een mock-adapter; zodra ANTHROPIC_API_KEY gezet is schakelt de
// provider automatisch over op de echte Anthropic-SDK.

export const llmConfig = {
  tier1Model: process.env.LLM_TIER1_MODEL ?? "claude-haiku-4-5-20251001",
  tier2Model: process.env.LLM_TIER2_MODEL ?? "claude-sonnet-4-6",
  maxTokens: Number(process.env.LLM_MAX_TOKENS ?? 1500),
  /** Verzoeken per minuut per locatie (eenvoudige in-memory rate-limit). */
  rateLimitPerMinute: Number(process.env.LLM_RATE_LIMIT_PER_MIN ?? 30),
  /** TTL van de Tier 1 response-cache in ms. */
  tier1CacheTtlMs: Number(process.env.LLM_TIER1_CACHE_TTL_MS ?? 5 * 60_000),
} as const;

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type Tier = "tier1" | "tier2";

export function modelForTier(tier: Tier): string {
  return tier === "tier1" ? llmConfig.tier1Model : llmConfig.tier2Model;
}
