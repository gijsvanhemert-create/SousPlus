import type { LlmMessage, LlmResponse, ToolResultBlock, ToolUseBlock } from "./types";
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

    // Claude kan MEERDERE tool_use-blocks in één antwoord teruggeven. Elk block
    // moet exact één tool_result terugkrijgen, anders faalt de volgende API-call
    // met "tool_use ids were found without tool_result blocks".
    const toolUses = res.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0 || finalRound) {
      messages.push({ role: "assistant", content: res.content });
      break;
    }

    // Bevestiging bij destructieve/overschrijvende acties: als één van de tools
    // in deze beurt bevestiging vereist, pauzeren we de HELE beurt vóór er iets
    // wordt uitgevoerd. De beurt wordt niet bewaard; de client herhaalt met
    // autoConfirm. Zo blijven er geen losse tool_use-blocks achter.
    if (!deps.autoConfirm) {
      const needsConfirm = toolUses.find((t) => deps.validate(t.name, t.input).ok && deps.requiresConfirm(t.name));
      if (needsConfirm) {
        return {
          text: prose,
          actions,
          navigateTo,
          messages: initialMessages, // half-afgemaakte beurt niet bewaren
          pendingConfirmation: {
            tool: needsConfirm.name,
            input: needsConfirm.input,
            summary: prose || `Chef Auguste wil "${needsConfirm.name}" uitvoeren.`,
          },
        };
      }
    }

    // De assistant-beurt (met alle tool_use-blocks) precies één keer opslaan …
    messages.push({ role: "assistant", content: res.content });

    // … en voor ELK tool_use-block een tool_result opbouwen, in dezelfde volgorde.
    const results: ToolResultBlock[] = [];
    let navigated = false;
    for (const toolUse of toolUses) {
      // 1. Server-side validatie vóór uitvoering.
      const valid = deps.validate(toolUse.name, toolUse.input);
      if (!valid.ok) {
        results.push({ type: "tool_result", tool_use_id: toolUse.id, content: `Validatiefout: ${valid.error}`, is_error: true });
        continue;
      }
      // 2. Uitvoeren; fouten gaan als tool_result terug zodat het model kan bijsturen.
      try {
        const outcome = await deps.execute(toolUse.name, toolUse.input);
        if (outcome.action) actions.push(outcome.action);
        if (outcome.navigateTo) navigateTo = outcome.navigateTo;
        results.push({ type: "tool_result", tool_use_id: toolUse.id, content: outcome.text });
        if (toolUse.name === "navigate_app") navigated = true;
      } catch (e) {
        results.push({ type: "tool_result", tool_use_id: toolUse.id, content: `Fout: ${(e as Error).message}`, is_error: true });
      }
    }

    // Alle tool_results samen in één user-bericht: elke tool_use blijft gekoppeld.
    messages.push({ role: "user", content: results });

    // Navigeren rondt de beurt af.
    if (navigated) {
      if (!prose) prose = "Geopend, chef.";
      break;
    }
  }

  if (!prose) prose = "Genoteerd, chef.";
  return { text: prose, actions, navigateTo, messages };
}
