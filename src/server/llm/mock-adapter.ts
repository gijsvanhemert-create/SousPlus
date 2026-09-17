import { systemToText, type LlmAdapter, type LlmRequest, type LlmResponse, type AssistantBlock, type LlmMessage } from "./types";
import { SAMPLE_INVOICE_TEXT } from "@/lib/ocr-sample";

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

// Bevat het laatste user-bericht een foto/PDF (vision-invoer)? De mock kan een
// echt beeld niet lezen, dus valt hij dan terug op de vaste voorbeeldfactuur.
function lastUserHasMedia(messages: LlmMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user") {
      return Array.isArray(m.content) && m.content.some((c) => c.type === "image" || c.type === "document");
    }
  }
  return false;
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

// Leest de APP-CONTEXT-JSON terug uit de system-prompt, zodat de mock met de
// ECHTE recipe-/versie-id's kan werken (net als het echte model zou doen).
type CtxMenuItem = { recipeId: string; dish: string; activeVersion: { id: string } | null };
function appContextMenu(system: string): CtxMenuItem[] {
  const marker = "APP-CONTEXT (JSON):\n";
  const idx = system.indexOf(marker);
  if (idx === -1) return [];
  try {
    const ctx = JSON.parse(system.slice(idx + marker.length)) as { menu?: CtxMenuItem[] };
    return ctx.menu ?? [];
  } catch {
    return [];
  }
}

function findRecipeInQuery(menu: CtxMenuItem[], q: string): CtxMenuItem | null {
  const hits = menu.filter((m) => q.includes(m.dish.toLowerCase()));
  hits.sort((a, b) => b.dish.length - a.dish.length); // langste (meest specifieke) match wint
  return hits[0] ?? null;
}

function parseTargetPrice(q: string): number | null {
  const m = q.match(/(?:naar|op|€|=)\s*€?\s*(\d+(?:[.,]\d{1,2})?)/) ?? q.match(/(\d+(?:[.,]\d{1,2})?)/);
  return m ? Number(m[1].replace(",", ".")) : null;
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

  // Streaming voor de mock: bereken het antwoord en geef de tekst in korte
  // brokjes door, zodat de streaming-UX ook zonder API-sleutel werkt/testbaar is.
  async streamMessage(req: LlmRequest, onText: (delta: string) => void): Promise<LlmResponse> {
    const res = await this.createMessage(req);
    const text = res.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    for (const chunk of text.match(/\S+\s*/g) ?? []) {
      onText(chunk);
      await new Promise((r) => setTimeout(r, 8));
    }
    return res;
  }

  async createMessage(req: LlmRequest): Promise<LlmResponse> {
    // system kan nu een string of cache-blokken zijn; normaliseer naar tekst.
    const system = systemToText(req.system);
    // Tier 1: OCR-extractie. De mock parseert de factuurtekst regelmatig (regex)
    // en geeft dezelfde JSON-array terug die het echte model zou geven. Bij een
    // foto/PDF (die de mock niet kan lezen) valt hij terug op de voorbeeldfactuur,
    // zodat de demo ook zonder API-sleutel regels toont.
    if (system.includes("OCR-extractielaag")) {
      const src = lastUserHasMedia(req.messages) ? SAMPLE_INVOICE_TEXT : rawLastUserText(req.messages);
      return text(JSON.stringify(parseInvoiceMock(src)));
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

    // Bestaande receptversie aanpassen (bv. menuprijs) — gebruikt de echte
    // versie-id uit de APP-CONTEXT, zodat update_recipe_version daadwerkelijk het
    // juiste recept raakt in plaats van een gegokt id.
    if (/(menuprijs|verhoog|verlaag|zet de prijs|prijs.*(aan|naar|op))/.test(q) && !/leverancier/.test(q)) {
      if (rounds === 0) {
        const target = findRecipeInQuery(appContextMenu(systemToText(req.system)), q);
        const price = parseTargetPrice(q);
        if (target?.activeVersion?.id && price) {
          return toolCall(
            "update_recipe_version",
            { id: target.activeVersion.id, menuPrice: price },
            `Ik pas de menuprijs van ${target.dish} aan naar €${price.toFixed(2)}.`,
          );
        }
        return text("Welk gerecht en welke nieuwe prijs, chef? Dan pas ik de versie meteen aan.");
      }
      return text("De nieuwe menuprijs staat vast; de marge is direct herberekend.");
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
