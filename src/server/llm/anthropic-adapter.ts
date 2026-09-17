import Anthropic from "@anthropic-ai/sdk";
import type { LlmAdapter, LlmRequest, LlmResponse, AssistantBlock, SystemBlock } from "./types";

/**
 * Vertaalt onze system-vorm naar de Anthropic-`system`-parameter. Een platte
 * string blijft een string (geen caching). Blokken worden text-blocks; een blok
 * met `cache: true` krijgt een ephemeral prompt-cache-breakpoint, zodat de
 * provider dat prefix (incl. de eraan voorafgaande tools) hergebruikt.
 */
export function toSystemParam(system: string | SystemBlock[]): string | Anthropic.TextBlockParam[] {
  if (typeof system === "string") return system;
  return system.map((b) => ({
    type: "text" as const,
    text: b.text,
    ...(b.cache ? { cache_control: { type: "ephemeral" as const } } : {}),
  }));
}

// Echte Anthropic-adapter. Wordt automatisch gekozen zodra ANTHROPIC_API_KEY is
// gezet. De sleutel staat uitsluitend server-side; het LLM wordt nooit vanuit de
// browser aangeroepen. Onze provider-neutrale berichtvorm is structureel gelijk
// aan de Messages-API, dus de vertaling is een dunne mapping.

export class AnthropicAdapter implements LlmAdapter {
  readonly name = "anthropic";
  private client = new Anthropic(); // leest ANTHROPIC_API_KEY uit de omgeving

  async createMessage(req: LlmRequest): Promise<LlmResponse> {
    const msg = await this.client.messages.create({
      model: req.model,
      max_tokens: req.maxTokens ?? 1500,
      system: toSystemParam(req.system),
      messages: req.messages as Anthropic.MessageParam[],
      ...(req.tools ? { tools: req.tools as Anthropic.Tool[] } : {}),
      ...(req.toolChoiceNone ? { tool_choice: { type: "none" } } : {}),
    });

    return toLlmResponse(msg);
  }

  async streamMessage(req: LlmRequest, onText: (delta: string) => void): Promise<LlmResponse> {
    const stream = this.client.messages.stream({
      model: req.model,
      max_tokens: req.maxTokens ?? 1500,
      system: toSystemParam(req.system),
      messages: req.messages as Anthropic.MessageParam[],
      ...(req.tools ? { tools: req.tools as Anthropic.Tool[] } : {}),
      ...(req.toolChoiceNone ? { tool_choice: { type: "none" } } : {}),
    });
    // Tekst-deltas doorsturen zodra ze binnenkomen (tool-input-JSON wordt niet
    // gestreamd — dat komt in het uiteindelijke bericht).
    stream.on("text", (delta) => onText(delta));
    const msg = await stream.finalMessage();
    return toLlmResponse(msg);
  }
}

export function toLlmResponse(msg: Anthropic.Message): LlmResponse {
  const content: AssistantBlock[] = [];
  for (const block of msg.content) {
    if (block.type === "text") content.push({ type: "text", text: block.text });
    else if (block.type === "tool_use")
      content.push({ type: "tool_use", id: block.id, name: block.name, input: block.input });
  }
  return {
    content,
    stopReason: msg.stop_reason ?? "end_turn",
    // input_tokens = niet-gecachte input; cache-writes/-reads apart (prompt-caching).
    usage: msg.usage
      ? {
          inputTokens: msg.usage.input_tokens,
          outputTokens: msg.usage.output_tokens,
          cacheCreationInputTokens: msg.usage.cache_creation_input_tokens ?? 0,
          cacheReadInputTokens: msg.usage.cache_read_input_tokens ?? 0,
        }
      : undefined,
  };
}
