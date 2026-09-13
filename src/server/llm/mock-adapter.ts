import type { LlmAdapter, LlmRequest, LlmResponse, AssistantBlock, LlmMessage } from "./types";

// Mock-LLM voor lokale ontwikkeling en demo's zonder ANTHROPIC_API_KEY.
//
// Twee modi:
//  1. Gescript (constructor-argument): geeft vooraf bepaalde antwoorden in
//     volgorde terug — gebruikt in de tests om de tool-loop deterministisch te
//     sturen.
//  2. Heuristisch (default): leidt een geloofwaardige actie af uit de laatste
//     vraag en de reeds uitgevoerde tools, zodat Chef Auguste in de demo echt
//     tools aanroept (zoeken → opslaan, HACCP klaarzetten, leverancier wisselen,
//     navigeren) zonder een echt model.

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `mocktool_${idCounter}`;
}

function lastUserText(messages: LlmMessage[]): string {
  return rawLastUserText(messages).toLowerCase();
}

function rawLastUserText(messages: LlmMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user" && typeof m.content === "string") return m.content;
  }
  return "";
}

// Eenvoudige factuurregel-parser voor de mock-OCR: "naam   aantal eenheid prijs totaal".
function parseInvoiceMock(text: string): Array<{ name: string; qty: number; unit: string; unitPrice: number; total: number }> {
  const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
  const out: Array<{ name: string; qty: number; unit: string; unitPrice: number; total: number }> = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^(.+?)\s{2,}([\d.,]+)\s+([A-Za-zL]+)\s+([\d.,]+)\s+([\d.,]+)\s*$/);
    if (m) out.push({ name: m[1].trim(), qty: num(m[2]), unit: m[3], unitPrice: num(m[4]), total: num(m[5]) });
  }
  return out;
}

function toolResultRounds(messages: LlmMessage[]): number {
  return messages.filter(
    (m) => m.role === "user" && Array.isArray(m.content) && m.content.some((c) => c.type === "tool_result"),
  ).length;
}

function lastToolResultJson(messages: LlmMessage[]): unknown {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user" && Array.isArray(m.content)) {
      const tr = m.content.find((c) => c.type === "tool_result");
      if (tr) {
        try {
          return JSON.parse(tr.content);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function text(t: string): LlmResponse {
  return { content: [{ type: "text", text: t }], stopReason: "end_turn" };
}

function toolCall(name: string, input: unknown, prose: string): LlmResponse {
  const blocks: AssistantBlock[] = [];
  if (prose) blocks.push({ type: "text", text: prose });
  blocks.push({ type: "tool_use", id: nextId(), name, input });
  return { content: blocks, stopReason: "tool_use" };
}

export class MockAdapter implements LlmAdapter {
  readonly name = "mock";
  private script?: LlmResponse[];

  constructor(script?: LlmResponse[]) {
    this.script = script;
  }

  async createMessage(req: LlmRequest): Promise<LlmResponse> {
    // Tier 1: OCR-extractie. De mock parseert de geplakte factuurtekst regelmatig
    // (regex) en geeft dezelfde JSON-array terug die het echte model zou geven.
    if (req.system.includes("OCR-extractielaag")) {
      return text(JSON.stringify(parseInvoiceMock(rawLastUserText(req.messages))));
    }
    if (this.script) {
      return this.script.shift() ?? text("Genoteerd, chef.");
    }
    return this.heuristic(req);
  }

  private heuristic(req: LlmRequest): LlmResponse {
    const q = lastUserText(req.messages);
    const rounds = toolResultRounds(req.messages);
    const finalRound = req.toolChoiceNone === true;

    if (finalRound) return text("Genoteerd, chef — alles staat klaar.");

    if (/haccp|dagstaat|voedselveiligheid/.test(q)) {
      if (rounds === 0) return toolCall("prepare_haccp", {}, "Ik zet de dagstaat voor je klaar, chef.");
      return text("De HACCP-dagstaat staat klaar op de pas. Vul de metingen in zodra je ze hebt.");
    }

    if (/leverancier|boter|wissel|goedkoper/.test(q)) {
      if (rounds === 0) {
        const ingredient = /boter/.test(q) ? "roomboter" : "ingrediënt";
        return toolCall("switch_supplier", { ingredient }, "Ik wissel naar een scherper geprijsde leverancier — marge beschermd.");
      }
      return text("De leverancier is gewisseld; de nieuwe inkoopprijs rekent direct door in je marge.");
    }

    if (/ga naar|open|navigeer|toon de|breng me/.test(q)) {
      const tab = /lab|recept/.test(q)
        ? "lab"
        : /catalog|ingredi/.test(q)
          ? "ingredients"
          : /haccp/.test(q)
            ? "haccp"
            : /matrix|menu-eng/.test(q)
              ? "matrix"
              : /supplier|leverancier/.test(q)
                ? "supplier"
                : "library";
      return toolCall("navigate_app", { tab }, "Ik open het voor je, chef.");
    }

    if (/biet|voorstel|nieuw|gerecht|recept|stel.*voor/.test(q)) {
      if (rounds === 0) {
        const query = /biet/.test(q) ? "biet" : /zalm/.test(q) ? "zalm" : "groente";
        return toolCall("search_ingredients", { query, max: 6 }, "Eerst echte inkoopprijzen uit de catalogus.");
      }
      if (rounds === 1) {
        const data = lastToolResultJson(req.messages) as { items?: Array<{ name: string; unit: string; price: number }> } | null;
        const items = data?.items?.slice(0, 3) ?? [];
        const ingredients = items.map((it) => ({
          name: it.name,
          g: it.unit === "kg" || it.unit === "L" ? 60 : 1,
          unit: it.unit === "kg" ? "g" : it.unit === "L" ? "ml" : it.unit,
          p: it.price,
          mode: it.unit === "kg" || it.unit === "L" ? "weight" : "piece",
        }));
        return toolCall(
          "save_recipe_version",
          {
            dish: /biet/.test(q) ? "Heritage Biet" : "Nieuw gerecht",
            category: "Vegetable",
            name: "Voorstel v1",
            note: "Voorstel op basis van live catalogusprijzen.",
            menuPrice: 16.5,
            prepTime: 25,
            ingredients,
            prep: ["Mise en place klaarzetten.", "Componenten garen.", "Afwerken en plateren."],
          },
          "Ik leg het voorstel vast in de Recipe Lab.",
        );
      }
      return text("Het voorstel staat in de Recipe Lab — bekijk de marge en stel bij waar nodig.");
    }

    if (/marge|analys|zwak|menu|rendement/.test(q)) {
      return text(
        "Ik heb het menu doorgenomen. De zalm staat onder druk — de marge schuurt tegen de 70%-grens. Knijp daar op de roomboter of til de menuprijs licht op; de rest van de kaart staat gezond.",
      );
    }

    return text("Genoteerd, chef. Zeg het maar — een analyse, een receptuur fijnslijpen, of de dagstaat klaarzetten.");
  }
}
