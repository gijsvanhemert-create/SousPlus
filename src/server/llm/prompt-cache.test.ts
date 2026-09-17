import { describe, it, expect } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { toSystemParam, toLlmResponse } from "./anthropic-adapter";
import { systemToText, type SystemBlock } from "./types";

// Prompt-caching, fase 1: het stabiele system-deel krijgt één cache-breakpoint,
// het dynamische deel erna niet. Hier bewijzen we de vertaling naar de
// Anthropic-`system`-parameter en de tekst-normalisatie (voor mock/inspectie).

describe("toSystemParam", () => {
  it("laat een platte string ongemoeid (geen caching)", () => {
    expect(toSystemParam("OCR-extractielaag ...")).toBe("OCR-extractielaag ...");
  });

  it("zet cache_control ALLEEN op het als cache gemarkeerde blok", () => {
    const system: SystemBlock[] = [
      { text: "STABIEL persona + tools", cache: true },
      { text: "APP-CONTEXT (JSON):\n{...}" },
    ];
    const out = toSystemParam(system);
    expect(Array.isArray(out)).toBe(true);
    const blocks = out as Array<{ type: string; text: string; cache_control?: { type: string } }>;

    expect(blocks).toHaveLength(2);
    // Stabiel blok: text-block mét ephemeral breakpoint.
    expect(blocks[0]).toEqual({
      type: "text",
      text: "STABIEL persona + tools",
      cache_control: { type: "ephemeral" },
    });
    // Dynamisch blok: text-block ZONDER cache_control (blijft ongecachet).
    expect(blocks[1]).toEqual({ type: "text", text: "APP-CONTEXT (JSON):\n{...}" });
    expect(blocks[1].cache_control).toBeUndefined();
  });
});

describe("toLlmResponse — cache-tokentelling", () => {
  function msg(usage: Partial<Anthropic.Usage>): Anthropic.Message {
    return {
      content: [{ type: "text", text: "ok" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 40, output_tokens: 12, ...usage },
    } as unknown as Anthropic.Message;
  }

  it("mapt cache-writes (eerste aanroep: creation > 0, read = 0)", () => {
    const res = toLlmResponse(msg({ cache_creation_input_tokens: 1600, cache_read_input_tokens: 0 }));
    expect(res.usage).toEqual({
      inputTokens: 40,
      outputTokens: 12,
      cacheCreationInputTokens: 1600,
      cacheReadInputTokens: 0,
    });
  });

  it("mapt een cache-HIT (volgende aanroep: read > 0) — dit is de besparing", () => {
    const res = toLlmResponse(msg({ cache_creation_input_tokens: 0, cache_read_input_tokens: 1600 }));
    expect(res.usage?.cacheReadInputTokens).toBe(1600);
    expect(res.usage?.cacheCreationInputTokens).toBe(0);
  });

  it("valt terug op 0 als de provider geen cache-velden meestuurt", () => {
    const res = toLlmResponse(msg({ cache_creation_input_tokens: null, cache_read_input_tokens: null }));
    expect(res.usage?.cacheCreationInputTokens).toBe(0);
    expect(res.usage?.cacheReadInputTokens).toBe(0);
  });
});

describe("systemToText", () => {
  it("geeft een string ongewijzigd terug", () => {
    expect(systemToText("hallo")).toBe("hallo");
  });

  it("voegt blokken samen tot doorzoekbare tekst (marker blijft vindbaar)", () => {
    const system: SystemBlock[] = [
      { text: "STABIEL", cache: true },
      { text: "APP-CONTEXT (JSON):\n{\"menu\":[]}" },
    ];
    const text = systemToText(system);
    expect(text).toContain("STABIEL");
    expect(text.indexOf("APP-CONTEXT (JSON):\n")).toBeGreaterThan(-1);
  });
});
