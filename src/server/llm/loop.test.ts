import { describe, it, expect, vi } from "vitest";
import { runToolLoop, type LoopDeps } from "./loop";
import type { LlmResponse, ToolResultBlock } from "./types";

function textRes(t: string): LlmResponse {
  return { content: [{ type: "text", text: t }], stopReason: "end_turn" };
}
function toolRes(name: string, input: unknown, prose = ""): LlmResponse {
  const content: LlmResponse["content"] = [];
  if (prose) content.push({ type: "text", text: prose });
  content.push({ type: "tool_use", id: `tu_${name}`, name, input });
  return { content, stopReason: "tool_use" };
}
function multiToolRes(tools: { name: string; input: unknown }[], prose = ""): LlmResponse {
  const content: LlmResponse["content"] = [];
  if (prose) content.push({ type: "text", text: prose });
  for (const t of tools) content.push({ type: "tool_use", id: `tu_${t.name}`, name: t.name, input: t.input });
  return { content, stopReason: "tool_use" };
}
function scriptedCall(responses: LlmResponse[]) {
  let i = 0;
  return vi.fn(async () => responses[i++] ?? textRes("klaar"));
}
function baseDeps(over: Partial<LoopDeps>): LoopDeps {
  return {
    call: scriptedCall([textRes("klaar")]),
    validate: () => ({ ok: true }),
    requiresConfirm: () => false,
    execute: async () => ({ text: "uitgevoerd" }),
    autoConfirm: false,
    ...over,
  };
}

function toolResults(messages: ReturnType<typeof runToolLoop> extends Promise<infer R> ? (R extends { messages: infer M } ? M : never) : never) {
  return (messages as { role: string; content: unknown }[])
    .filter((m) => m.role === "user" && Array.isArray(m.content))
    .flatMap((m) => m.content as ToolResultBlock[])
    .filter((c) => c.type === "tool_result");
}

describe("runToolLoop", () => {
  it("voert een tool uit en rondt af met de proza-tekst", async () => {
    const execute = vi.fn(async () => ({ text: "10 artikelen", action: { kind: "search" as const, label: "10 artikelen" } }));
    const deps = baseDeps({
      call: scriptedCall([toolRes("search_ingredients", { query: "biet" }, "Eerst de catalogus."), textRes("Voorstel klaar.")]),
      execute,
    });
    const result = await runToolLoop([{ role: "user", content: "stel een biet voor" }], deps);

    expect(result.text).toBe("Voorstel klaar.");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.actions).toHaveLength(1);
    expect(toolResults(result.messages)).toHaveLength(1);
  });

  it("gate't een destructieve actie achter een bevestiging", async () => {
    const execute = vi.fn(async () => ({ text: "gewisseld" }));
    const deps = baseDeps({
      call: scriptedCall([toolRes("switch_supplier", { ingredient: "boter" }, "Ik wissel.")]),
      requiresConfirm: (name) => name === "switch_supplier",
      execute,
    });
    const result = await runToolLoop([{ role: "user", content: "wissel boter" }], deps);

    expect(result.pendingConfirmation).toBeDefined();
    expect(result.pendingConfirmation?.tool).toBe("switch_supplier");
    expect(execute).not.toHaveBeenCalled();
  });

  it("gate't op basis van de tool-INPUT (bevestiging alleen bij bepaalde velden)", async () => {
    const execute = vi.fn(async () => ({ text: "opgeslagen" }));
    // save_recipe_version bevestigt alleen wanneer asComponentOf is meegegeven.
    const deps = baseDeps({
      call: scriptedCall([toolRes("save_recipe_version", { name: "Saus", asComponentOf: { parentRecipeId: "p" } }, "Ik koppel de saus.")]),
      requiresConfirm: (name, input) => name === "save_recipe_version" && !!(input as { asComponentOf?: unknown }).asComponentOf,
      execute,
    });
    const result = await runToolLoop([{ role: "user", content: "maak saus als component" }], deps);
    expect(result.pendingConfirmation?.tool).toBe("save_recipe_version");
    expect(execute).not.toHaveBeenCalled();
  });

  it("gate't NIET wanneer de input de bevestiging niet triggert", async () => {
    const execute = vi.fn(async () => ({ text: "opgeslagen" }));
    const deps = baseDeps({
      call: scriptedCall([toolRes("save_recipe_version", { name: "Saus" }, "Ik sla op."), textRes("Klaar.")]),
      requiresConfirm: (name, input) => name === "save_recipe_version" && !!(input as { asComponentOf?: unknown }).asComponentOf,
      execute,
    });
    const result = await runToolLoop([{ role: "user", content: "sla saus op" }], deps);
    expect(result.pendingConfirmation).toBeUndefined();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("voert de destructieve actie uit zodra autoConfirm gezet is", async () => {
    const execute = vi.fn(async () => ({ text: "gewisseld", navigateTo: "/supplier" }));
    const deps = baseDeps({
      call: scriptedCall([toolRes("switch_supplier", { ingredient: "boter" }, "Ik wissel."), textRes("Leverancier gewisseld.")]),
      requiresConfirm: (name) => name === "switch_supplier",
      autoConfirm: true,
      execute,
    });
    const result = await runToolLoop([{ role: "user", content: "wissel boter" }], deps);

    expect(result.pendingConfirmation).toBeUndefined();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.navigateTo).toBe("/supplier");
  });

  it("voedt een validatiefout terug en blijft draaien zonder uit te voeren", async () => {
    const execute = vi.fn(async () => ({ text: "x" }));
    const deps = baseDeps({
      call: scriptedCall([toolRes("save_recipe_version", { bad: true }), textRes("Begrepen, chef.")]),
      validate: () => ({ ok: false, error: "name is verplicht" }),
      execute,
    });
    const result = await runToolLoop([{ role: "user", content: "sla op" }], deps);

    expect(execute).not.toHaveBeenCalled();
    const errors = toolResults(result.messages).filter((c) => c.is_error);
    expect(errors).toHaveLength(1);
    expect(errors[0].content).toContain("Validatiefout");
    expect(result.text).toBe("Begrepen, chef.");
  });

  it("vangt een executor-fout op als tool_result en stuurt bij", async () => {
    const deps = baseDeps({
      call: scriptedCall([toolRes("prepare_haccp", {}), textRes("Toch gelukt.")]),
      execute: vi.fn(async () => {
        throw new Error("DB onbereikbaar");
      }),
    });
    const result = await runToolLoop([{ role: "user", content: "haccp" }], deps);
    const errors = toolResults(result.messages).filter((c) => c.is_error);
    expect(errors[0].content).toContain("DB onbereikbaar");
    expect(result.text).toBe("Toch gelukt.");
  });

  it("rondt de beurt af na navigate_app", async () => {
    const execute = vi.fn(async () => ({ text: "Geopend.", navigateTo: "/lab" }));
    const deps = baseDeps({
      call: scriptedCall([toolRes("navigate_app", { tab: "lab" }, "Ik open de lab.")]),
      execute,
    });
    const result = await runToolLoop([{ role: "user", content: "open de lab" }], deps);
    expect(result.navigateTo).toBe("/lab");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("koppelt elk tool_use-block aan een tool_result bij meerdere tools in één beurt", async () => {
    const execute = vi.fn(async (name: string) => ({ text: `${name} klaar` }));
    const deps = baseDeps({
      call: scriptedCall([
        multiToolRes(
          [
            { name: "search_ingredients", input: { query: "biet" } },
            { name: "search_ingredients", input: { query: "geit" } },
          ],
          "Ik zoek twee artikelen.",
        ),
        textRes("Beide gevonden."),
      ]),
      execute,
    });
    const result = await runToolLoop([{ role: "user", content: "zoek biet en geit" }], deps);

    expect(execute).toHaveBeenCalledTimes(2);
    // Elk tool_use-id moet exact één tool_result terugkrijgen.
    const toolUseIds = (result.messages as { role: string; content: unknown }[])
      .filter((m) => m.role === "assistant" && Array.isArray(m.content))
      .flatMap((m) => m.content as { type: string; id?: string }[])
      .filter((b) => b.type === "tool_use")
      .map((b) => b.id);
    const resultIds = toolResults(result.messages).map((r) => r.tool_use_id);
    expect(toolUseIds).toHaveLength(2);
    expect(resultIds.sort()).toEqual(toolUseIds.sort());
    expect(result.text).toBe("Beide gevonden.");
  });

  it("voert niets uit als één van meerdere tools bevestiging vereist", async () => {
    const execute = vi.fn(async () => ({ text: "gedaan" }));
    const deps = baseDeps({
      call: scriptedCall([
        multiToolRes([
          { name: "search_ingredients", input: { query: "boter" } },
          { name: "switch_supplier", input: { ingredient: "boter" } },
        ]),
      ]),
      requiresConfirm: (name) => name === "switch_supplier",
      execute,
    });
    const result = await runToolLoop([{ role: "user", content: "wissel boter" }], deps);

    expect(result.pendingConfirmation?.tool).toBe("switch_supplier");
    expect(execute).not.toHaveBeenCalled();
  });

  it("respecteert maxRounds en blijft niet oneindig draaien", async () => {
    const execute = vi.fn(async () => ({ text: "ronde" }));
    // Het model blijft tools aanroepen; de loop moet stoppen op maxRounds.
    const call = vi.fn(async () => toolRes("search_ingredients", { query: "x" }, "nog een ronde"));
    const result = await runToolLoop([{ role: "user", content: "blijf zoeken" }], {
      ...baseDeps({}),
      call,
      execute,
      maxRounds: 3,
    });
    // Laatste ronde forceert toolChoiceNone, dus hoogstens maxRounds-1 uitvoeringen.
    expect(execute.mock.calls.length).toBeLessThanOrEqual(2);
    expect(result.text).toBe("nog een ronde");
  });
});
