import { describe, it, expect, vi, beforeEach } from "vitest";
import { IntelligentRouter, RateLimitError } from "./router";
import { llmConfig } from "./config";
import type { LlmAdapter, LlmRequest, LlmResponse } from "./types";

// Usage-logging mocken zodat de router-tests hermetisch blijven (geen DB) en we
// de logging-wiring kunnen verifiëren.
vi.mock("./usage", () => ({ logLlmUsage: vi.fn(async () => {}) }));
import { logLlmUsage } from "./usage";
const logMock = vi.mocked(logLlmUsage);

class CountingAdapter implements LlmAdapter {
  readonly name = "counting";
  calls = 0;
  lastModel = "";
  async createMessage(req: LlmRequest): Promise<LlmResponse> {
    this.calls += 1;
    this.lastModel = req.model;
    return { content: [{ type: "text", text: "ok" }], stopReason: "end_turn" };
  }
}

// Adapter die usage teruggeeft, zoals de echte AnthropicAdapter.
class UsageAdapter implements LlmAdapter {
  readonly name = "usage";
  lastModel = "";
  async createMessage(req: LlmRequest): Promise<LlmResponse> {
    this.lastModel = req.model;
    return { content: [{ type: "text", text: "ok" }], stopReason: "end_turn", usage: { inputTokens: 100, outputTokens: 20 } };
  }
}

beforeEach(() => logMock.mockClear());

const baseReq = { system: "sys", messages: [{ role: "user" as const, content: "hoi" }] };

describe("IntelligentRouter", () => {
  it("kiest het model per tier uit de config", async () => {
    const adapter = new CountingAdapter();
    const router = new IntelligentRouter(adapter);

    await router.run("tier2", baseReq, { locationId: "loc1" });
    expect(adapter.lastModel).toBe(llmConfig.tier2Model);

    await router.run("tier1", baseReq, { locationId: "loc1" });
    expect(adapter.lastModel).toBe(llmConfig.tier1Model);
  });

  it("cachet Tier 1-antwoorden op identieke input", async () => {
    const adapter = new CountingAdapter();
    const router = new IntelligentRouter(adapter);

    await router.run("tier1", baseReq, { locationId: "loc1" });
    await router.run("tier1", baseReq, { locationId: "loc1" });
    expect(adapter.calls).toBe(1); // tweede keer uit cache

    await router.run("tier1", { ...baseReq, system: "andere" }, { locationId: "loc1" });
    expect(adapter.calls).toBe(2); // andere input → cache-miss
  });

  it("cachet Tier 2 niet", async () => {
    const adapter = new CountingAdapter();
    const router = new IntelligentRouter(adapter);
    await router.run("tier2", baseReq, { locationId: "loc1" });
    await router.run("tier2", baseReq, { locationId: "loc1" });
    expect(adapter.calls).toBe(2);
  });

  it("rate-limit't per locatie", async () => {
    const adapter = new CountingAdapter();
    const router = new IntelligentRouter(adapter);
    const limit = llmConfig.rateLimitPerMinute;

    for (let i = 0; i < limit; i++) {
      await router.run("tier2", baseReq, { locationId: "loc-rl" });
    }
    await expect(router.run("tier2", baseReq, { locationId: "loc-rl" })).rejects.toBeInstanceOf(RateLimitError);

    // Andere locatie heeft een eigen budget.
    await expect(router.run("tier2", baseReq, { locationId: "loc-other" })).resolves.toBeDefined();
  });

  it("logt tokenverbruik met tier, model en action wanneer de adapter usage teruggeeft", async () => {
    const router = new IntelligentRouter(new UsageAdapter());
    await router.run("tier2", baseReq, { locationId: "loc1", action: "chef" });

    expect(logMock).toHaveBeenCalledTimes(1);
    expect(logMock).toHaveBeenCalledWith({
      locationId: "loc1",
      model: llmConfig.tier2Model,
      tier: "tier2",
      action: "chef",
      usage: { inputTokens: 100, outputTokens: 20 },
    });
  });

  it("logt niet wanneer de adapter geen usage teruggeeft", async () => {
    const router = new IntelligentRouter(new CountingAdapter());
    await router.run("tier2", baseReq, { locationId: "loc1", action: "chef" });
    expect(logMock).not.toHaveBeenCalled();
  });

  it("logt niet bij een Tier 1 cache-hit (geen API-aanroep, geen kosten)", async () => {
    const router = new IntelligentRouter(new UsageAdapter());
    await router.run("tier1", baseReq, { locationId: "loc1", action: "ocr:image" });
    await router.run("tier1", baseReq, { locationId: "loc1", action: "ocr:image" }); // cache-hit
    expect(logMock).toHaveBeenCalledTimes(1);
  });
});
