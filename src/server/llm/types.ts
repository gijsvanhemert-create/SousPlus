// Provider-neutrale berichttypen voor de Intelligent Router en de tool-loop.
// Structureel compatibel met de Anthropic Messages-API, maar bewust losgekoppeld
// zodat de tool-loop model-agnostisch is en met een mock-adapter testbaar blijft
// (geen ANTHROPIC_API_KEY nodig in tests).

export type TextBlock = { type: "text"; text: string };
export type ToolUseBlock = { type: "tool_use"; id: string; name: string; input: unknown };
export type AssistantBlock = TextBlock | ToolUseBlock;

export type ToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};

export type LlmMessage =
  | { role: "user"; content: string | ToolResultBlock[] }
  | { role: "assistant"; content: AssistantBlock[] };

export type ToolSchema = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type LlmRequest = {
  model: string;
  system: string;
  messages: LlmMessage[];
  tools?: ToolSchema[];
  /** Forceer geen tool-gebruik meer (laatste ronde van de loop). */
  toolChoiceNone?: boolean;
  maxTokens?: number;
};

export type StopReason = "end_turn" | "tool_use" | "max_tokens" | "refusal" | string;

export type LlmResponse = {
  content: AssistantBlock[];
  stopReason: StopReason;
};

export interface LlmAdapter {
  /** Naam van de adapter (voor logging): "mock" | "anthropic". */
  readonly name: string;
  createMessage(req: LlmRequest): Promise<LlmResponse>;
}
