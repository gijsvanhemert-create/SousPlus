import { createHash } from "node:crypto";
import { llmConfig, modelForTier, hasApiKey, type Tier } from "./config";
import type { LlmAdapter, LlmRequest, LlmResponse } from "./types";
import { MockAdapter } from "./mock-adapter";
import { AnthropicAdapter } from "./anthropic-adapter";

// Server-side Intelligent Router.
//  - Modelkeuze per taak (Tier 1 goedkoop/volume, Tier 2 advies/tool-use).
//  - Response-caching op Tier 1 om de COGS te drukken.
//  - Eenvoudige in-memory rate-limiting per locatie + gestructureerde logging.
// In productie verhuizen cache en rate-limit naar een gedeelde store (Redis);
// in-memory volstaat per server-instance voor de huidige fase.

export class RateLimitError extends Error {
  constructor(message = "Te veel AI-verzoeken — probeer het zo opnieuw.") {
    super(message);
    this.name = "RateLimitError";
  }
}

type CacheEntry = { value: LlmResponse; expires: number };

export class IntelligentRouter {
  private tier1Cache = new Map<string, CacheEntry>();
  private hits = new Map<string, number[]>();

  constructor(private adapter: LlmAdapter) {}

  async run(
    tier: Tier,
    req: Omit<LlmRequest, "model">,
    opts: { locationId: string },
  ): Promise<LlmResponse> {
    this.enforceRateLimit(opts.locationId);
    const model = modelForTier(tier);
    const fullReq: LlmRequest = { ...req, model };

    if (tier === "tier1") {
      const key = this.cacheKey(fullReq);
      const cached = this.getCached(key);
      if (cached) {
        this.log(tier, model, 0, true, opts.locationId);
        return cached;
      }
      const res = await this.timed(tier, model, opts.locationId, fullReq);
      this.setCached(key, res);
      return res;
    }

    return this.timed(tier, model, opts.locationId, fullReq);
  }

  private async timed(
    tier: Tier,
    model: string,
    locationId: string,
    req: LlmRequest,
  ): Promise<LlmResponse> {
    const start = Date.now();
    const res = await this.adapter.createMessage(req);
    this.log(tier, model, Date.now() - start, false, locationId);
    return res;
  }

  // --- Rate-limiting (sliding window van 60s per locatie) ---
  private enforceRateLimit(locationId: string) {
    const now = Date.now();
    const windowStart = now - 60_000;
    const recent = (this.hits.get(locationId) ?? []).filter((t) => t > windowStart);
    if (recent.length >= llmConfig.rateLimitPerMinute) {
      throw new RateLimitError();
    }
    recent.push(now);
    this.hits.set(locationId, recent);
  }

  // --- Tier 1 response-cache ---
  private cacheKey(req: LlmRequest): string {
    const material = JSON.stringify({ s: req.system, m: req.messages, t: req.tools });
    return createHash("sha256").update(material).digest("hex");
  }
  private getCached(key: string): LlmResponse | null {
    const entry = this.tier1Cache.get(key);
    if (!entry) return null;
    if (entry.expires < Date.now()) {
      this.tier1Cache.delete(key);
      return null;
    }
    return entry.value;
  }
  private setCached(key: string, value: LlmResponse) {
    this.tier1Cache.set(key, { value, expires: Date.now() + llmConfig.tier1CacheTtlMs });
  }

  private log(tier: Tier, model: string, latencyMs: number, cacheHit: boolean, locationId: string) {
    console.log(
      JSON.stringify({
        at: "llm.router",
        tier,
        model,
        adapter: this.adapter.name,
        latencyMs,
        cacheHit,
        locationId,
      }),
    );
  }
}

/** Kies de adapter op basis van de omgeving (echte SDK zodra de sleutel er is). */
export function getAdapter(): LlmAdapter {
  return hasApiKey() ? new AnthropicAdapter() : new MockAdapter();
}

let singleton: IntelligentRouter | null = null;
export function getRouter(): IntelligentRouter {
  if (!singleton) singleton = new IntelligentRouter(getAdapter());
  return singleton;
}
