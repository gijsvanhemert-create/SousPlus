import { describe, it, expect, vi, beforeEach } from "vitest";

// logLlmUsage moet de cache-tokentellingen mee-persisteren, zodat we in de praktijk
// cache-writes vs. -reads (de besparing) kunnen zien. We mocken prisma.

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/server/db", () => ({ prisma: { llmUsageLog: { create } } }));

import { logLlmUsage } from "./usage";

beforeEach(() => create.mockClear());

describe("logLlmUsage", () => {
  it("persisteert cache-writes en -reads", async () => {
    await logLlmUsage({
      locationId: "loc",
      model: "claude-sonnet-4-6",
      tier: "tier2",
      action: "chef",
      usage: { inputTokens: 40, outputTokens: 12, cacheCreationInputTokens: 1600, cacheReadInputTokens: 0 },
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ inputTokens: 40, cacheCreationTokens: 1600, cacheReadTokens: 0 }),
      }),
    );
  });

  it("valt terug op 0 als de usage geen cache-velden bevat (mock/oud pad)", async () => {
    await logLlmUsage({
      locationId: "loc",
      model: "claude-sonnet-4-6",
      tier: "tier2",
      action: "chef",
      usage: { inputTokens: 100, outputTokens: 20 },
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ cacheCreationTokens: 0, cacheReadTokens: 0 }) }),
    );
  });
});
