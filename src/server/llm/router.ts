import { createHash } from "node:crypto";
import { llmConfig, modelForTier, hasApiKey, type Tier } from "./config";
import type { LlmAdapter, LlmRequest, LlmResponse } from "./types";
import { MockAdapter } from "./mock-adapter";
import { AnthropicAdapter } from "./anthropic-adapter";
import { logLlmUsage } from "./usage";

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
    opts: { locationId: string; action?: string },
  ): Promise<LlmResponse> {
    this.enforceRateLimit(opts.locationId);
    const model = modelForTier(tier);
    const fullReq: LlmRequest = { ...req, model };

    if (tier === "tier1") {
      const key = this.cacheKey(fullReq);
      const cached = this.getCached(key);
      if (cached) {
        // Cache-hit = geen API-aanroep, dus geen kosten en geen usage-log.
        this.log(tier, model, 0, true, opts.locationId);
        return cached;
      }
      const res = await this.timed(tier, model, opts.locationId, fullReq, opts.action);
      this.setCached(key, res);
      return res;
    }

    return this.timed(tier, model, opts.locationId, fullReq, opts.action);
  }

  /**
   * Als `run`, maar streamt tekst-deltas via `onText` terwijl het model genereert.
   * Geen caching (alleen voor tier2/tool-use gebruikt). Valt terug op createMessage
   * wanneer de adapter geen streaming ondersteunt.
   */
  async runStream(
    tier: Tier,
    req: Omit<LlmRequest, "model">,
    opts: { locationId: string; action?: string },
    onText: (delta: string) => void,
  ): Promise<LlmResponse> {
    this.enforceRateLimit(opts.locationId);
    const model = modelForTier(tier);
    const fullReq: LlmRequest = { ...req, model };
    const start = Date.now();
    let res: LlmResponse;
    if (this.adapter.streamMessage) {
      res = await this.adapter.streamMessage(fullReq, onText);
    } else {
      res = await this.adapter.createMessage(fullReq);
      const text = res.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      if (text) onText(text);
    }
    this.log(tier, model, Date.now() - start, false, opts.locationId);
    await this.recordUsage(tier, model, opts.locationId, opts.action, res);
    return res;
  }

  private async timed(
    tier: Tier,
    model: string,
    locationId: string,
    req: LlmRequest,
    action?: string,
  ): Promise<LlmResponse> {
    const start = Date.now();
    const res = await this.adapter.createMessage(req);
    this.log(tier, model, Date.now() - start, false, locationId);
    await this.recordUsage(tier, model, locationId, action, res);
    return res;
  }

  // Persisteert het tokenverbruik als de adapter usage teruggaf (echte API-call).
  // logLlmUsage vangt fouten zelf op — dit kan de hoofdflow niet breken.
  private async recordUsage(tier: Tier, model: string, locationId: string, action: string | undefined, res: LlmResponse) {
    if (!res.usage) return;
    // Korte cache-samenvatting in de serverlogs: cacheRead > 0 = echte hit
    // (besparing); alleen cacheCreation = write-only (nog geen besparing).
    console.log(
      JSON.stringify({
        at: "llm.usage",
        tier,
        model,
        action: action ?? tier,
        inputTokens: res.usage.inputTokens,
        outputTokens: res.usage.outputTokens,
        cacheCreationTokens: res.usage.cacheCreationInputTokens ?? 0,
        cacheReadTokens: res.usage.cacheReadInputTokens ?? 0,
      }),
    );
    await logLlmUsage({ locationId, model, tier, action: action ?? tier, usage: res.usage });
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
