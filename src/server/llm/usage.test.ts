import { describe, it, expect, vi, beforeEach } from "vitest";

const { db } = vi.hoisted(() => ({
  db: { llmUsageLog: { create: vi.fn(async () => ({})) } },
}));
vi.mock("@/server/db", () => ({ prisma: db }));

import { logLlmUsage } from "./usage";

beforeEach(() => vi.clearAllMocks());

describe("logLlmUsage", () => {
  it("schrijft een usage-regel met de juiste velden", async () => {
    await logLlmUsage({
      locationId: "loc1",
      model: "claude-sonnet-4-6",
      tier: "tier2",
      action: "chef",
      usage: { inputTokens: 5503, outputTokens: 250 },
    });

    expect(db.llmUsageLog.create).toHaveBeenCalledWith({
      data: {
        locationId: "loc1",
        model: "claude-sonnet-4-6",
        tier: "tier2",
        action: "chef",
        inputTokens: 5503,
        outputTokens: 250,
      },
    });
  });

  it("breekt NIET wanneer de database faalt (telemetrie mag de hoofdflow niet raken)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    db.llmUsageLog.create.mockRejectedValueOnce(new Error("db down"));

    await expect(
      logLlmUsage({
        locationId: "loc1",
        model: "claude-haiku-4-5-20251001",
        tier: "tier1",
        action: "ocr:image",
        usage: { inputTokens: 2500, outputTokens: 300 },
      }),
    ).resolves.toBeUndefined();
  });
});
