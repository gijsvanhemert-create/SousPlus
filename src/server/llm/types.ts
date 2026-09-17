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

// Beeld-/documentinvoer voor vision (factuur-OCR vanaf foto of PDF). Structureel
// gelijk aan de Anthropic image/document content-blocks, zodat de adapter ze
// zonder vertaallaag kan doorgeven. `data` is altijd base64.
export type ImageBlock = {
  type: "image";
  source: { type: "base64"; media_type: string; data: string };
};
export type DocumentBlock = {
  type: "document";
  source: { type: "base64"; media_type: "application/pdf"; data: string };
};

// Alles wat in een user-bericht kan zitten: platte tekst, tool-resultaten uit de
// tool-loop, of beeld/PDF voor vision.
export type UserContentBlock = TextBlock | ImageBlock | DocumentBlock | ToolResultBlock;

export type LlmMessage =
  | { role: "user"; content: string | UserContentBlock[] }
  | { role: "assistant"; content: AssistantBlock[] };

export type ToolSchema = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

/**
 * Eén segment van de system-prompt. `cache: true` markeert een
 * prompt-cache-breakpoint: alles vóór en op dit segment (incl. de tools, die in de
 * cache-prefix aan het systeem voorafgaan) wordt door de provider gecachet. Zet
 * dit alléén op het STABIELE deel; het dynamische deel erna volgt ongecachet.
 */
export type SystemBlock = { text: string; cache?: boolean };

export type LlmRequest = {
  model: string;
  /** Platte string (geen caching) of blokken met een cache-breakpoint. */
  system: string | SystemBlock[];
  messages: LlmMessage[];
  tools?: ToolSchema[];
  /** Forceer geen tool-gebruik meer (laatste ronde van de loop). */
  toolChoiceNone?: boolean;
  maxTokens?: number;
};

/**
 * Platte tekst van een system-prompt: een string blijft ongewijzigd, blokken
 * worden samengevoegd. Voor adapters/mocks die de prompt als tekst inspecteren.
 */
export function systemToText(system: string | SystemBlock[]): string {
  return typeof system === "string" ? system : system.map((b) => b.text).join("\n");
}

export type StopReason = "end_turn" | "tool_use" | "max_tokens" | "refusal" | string;

/**
 * Tokenverbruik van één aanroep (voor kosten-telemetrie). Met prompt-caching telt
 * `inputTokens` alléén de NIET-gecachte input; cache-writes en cache-reads worden
 * apart geteld (writes ~1.25×, reads ~0.1× de normale inputprijs).
 */
export type LlmUsage = {
  inputTokens: number;
  outputTokens: number;
  /** Tokens die NU in de cache zijn geschreven (eerste keer / na TTL-verval). */
  cacheCreationInputTokens?: number;
  /** Tokens die uit de cache zijn GELEZEN (de besparing — dit is de cache-hit). */
  cacheReadInputTokens?: number;
};

export type LlmResponse = {
  content: AssistantBlock[];
  stopReason: StopReason;
  /** Aanwezig bij de echte adapter; de mock laat dit weg (geen echte kosten). */
  usage?: LlmUsage;
};

export interface LlmAdapter {
  /** Naam van de adapter (voor logging): "mock" | "anthropic". */
  readonly name: string;
  createMessage(req: LlmRequest): Promise<LlmResponse>;
  /**
   * Optioneel streamen: roept `onText` aan met tekst-deltas terwijl het model
   * genereert, en levert daarna dezelfde volledige LlmResponse als createMessage
   * (inclusief tool_use-blocks). Adapters zonder streaming laten dit weg; de
   * router valt dan terug op createMessage.
   */
  streamMessage?(req: LlmRequest, onText: (delta: string) => void): Promise<LlmResponse>;
}
