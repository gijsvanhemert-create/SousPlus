import Anthropic from "@anthropic-ai/sdk";
import type { LlmAdapter, LlmRequest, LlmResponse, AssistantBlock } from "./types";

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
      system: req.system,
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
      system: req.system,
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

function toLlmResponse(msg: Anthropic.Message): LlmResponse {
  const content: AssistantBlock[] = [];
  for (const block of msg.content) {
    if (block.type === "text") content.push({ type: "text", text: block.text });
    else if (block.type === "tool_use")
      content.push({ type: "tool_use", id: block.id, name: block.name, input: block.input });
  }
  return { content, stopReason: msg.stop_reason ?? "end_turn" };
}
