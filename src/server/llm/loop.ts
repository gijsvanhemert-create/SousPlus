import type { LlmMessage, LlmResponse, ToolUseBlock } from "./types";
import type { ChefAction } from "./tools";

// Pure, provider- en DB-onafhankelijke tool-loop. De server-side orkestratie van
// Chef Auguste: roep het model aan, valideer tool-input, gate destructieve acties
// achter een bevestiging, voer uit, voed het resultaat terug, herhaal tot het
// model klaar is. Afhankelijkheden worden geïnjecteerd zodat de loop met een
// mock-adapter en nep-tools getest kan worden (geen sleutel, geen database).

export type Validation = { ok: true } | { ok: false; error: string };

export type LoopExecuteOutcome = {
  text: string;
  action?: ChefAction;
  navigateTo?: string;
};

export type LoopDeps = {
  call: (args: { messages: LlmMessage[]; toolChoiceNone?: boolean }) => Promise<LlmResponse>;
  validate: (name: string, input: unknown) => Validation;
  requiresConfirm: (name: string) => boolean;
  execute: (name: string, input: unknown) => Promise<LoopExecuteOutcome>;
  autoConfirm: boolean;
  maxRounds?: number;
};

export type PendingConfirmation = { tool: string; input: unknown; summary: string };

export type LoopResult = {
  text: string;
  actions: ChefAction[];
  navigateTo?: string;
  /** Volledige conversatie incl. nieuwe beurten — alleen relevant bij voltooiing. */
  messages: LlmMessage[];
  /** Gezet wanneer een destructieve actie op bevestiging wacht. */
  pendingConfirmation?: PendingConfirmation;
};

function proseOf(res: LlmResponse): string {
  return res.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export async function runToolLoop(initialMessages: LlmMessage[], deps: LoopDeps): Promise<LoopResult> {
  const messages: LlmMessage[] = [...initialMessages];
  const actions: ChefAction[] = [];
  let prose = "";
  let navigateTo: string | undefined;
  const maxRounds = deps.maxRounds ?? 6;

  for (let round = 0; round < maxRounds; round++) {
    const finalRound = round === maxRounds - 1;
    const res = await deps.call({ messages, toolChoiceNone: finalRound });

    const txt = proseOf(res);
    if (txt) prose = txt;

    const toolUse = res.content.find((b): b is ToolUseBlock => b.type === "tool_use");
    if (!toolUse || finalRound) {
      messages.push({ role: "assistant", content: res.content });
      break;
    }

    // 1. Server-side validatie vóór uitvoering.
    const valid = deps.validate(toolUse.name, toolUse.input);
    if (!valid.ok) {
      messages.push({ role: "assistant", content: res.content });
      messages.push({
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: toolUse.id, content: `Validatiefout: ${valid.error}`, is_error: true },
        ],
      });
      continue;
    }

    // 2. Bevestiging bij destructieve/overschrijvende acties.
    if (deps.requiresConfirm(toolUse.name) && !deps.autoConfirm) {
      return {
        text: prose,
        actions,
        navigateTo,
        messages: initialMessages, // half-afgemaakte beurt niet bewaren
        pendingConfirmation: {
          tool: toolUse.name,
          input: toolUse.input,
          summary: prose || `Chef Auguste wil "${toolUse.name}" uitvoeren.`,
        },
      };
    }

    // 3. Uitvoeren; fouten gaan als tool_result terug zodat het model kan bijsturen.
    let outcome: LoopExecuteOutcome;
    try {
      outcome = await deps.execute(toolUse.name, toolUse.input);
    } catch (e) {
      messages.push({ role: "assistant", content: res.content });
      messages.push({
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: toolUse.id, content: `Fout: ${(e as Error).message}`, is_error: true },
        ],
      });
      continue;
    }

    if (outcome.action) actions.push(outcome.action);
    if (outcome.navigateTo) navigateTo = outcome.navigateTo;
    messages.push({ role: "assistant", content: res.content });
    messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: toolUse.id, content: outcome.text }] });

    // Navigeren rondt de beurt af.
    if (toolUse.name === "navigate_app") {
      if (!prose) prose = "Geopend, chef.";
      break;
    }
  }

  if (!prose) prose = "Genoteerd, chef.";
  return { text: prose, actions, navigateTo, messages };
}
