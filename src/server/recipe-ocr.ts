import { prisma } from "@/server/db";
import { getRouter } from "@/server/llm/router";
import { tokensOf, bestCandidate } from "@/server/ocr";
import type { LlmResponse, UserContentBlock } from "@/server/llm/types";
import { parseExtractedRecipe, toStorageIngredient, type CostMode } from "@/lib/recipe-ocr-parse";

// Recept-import (OCR) — Tier 2 van de Intelligent Router (Sonnet). Een recept is
// complexer dan een factuur (naam + ingrediënten mét hoeveelheden + doorlopende
// bereidingstekst) en is vaak handgeschreven, dus we kiezen bewust het sterkere
// model. Extractie muteert niets; opslaan gebeurt pas na bevestiging door de chef.

export const RECIPE_OCR_SYSTEM =
  "Je bent de recept-extractielaag van SousPlus+. Je krijgt een foto of PDF van een (vaak handgeschreven) recept en " +
  "geeft UITSLUITEND geldige JSON terug, geen uitleg. Structuur: " +
  '{"dish": string, "category": string|null, "serves": number|null, ' +
  '"ingredients": [{"name": string, "qty": number|null, "unit": string|null}], "steps": [string], "warnings": [string]}. ' +
  "Regels: lees handschrift zorgvuldig. Kun je een hoeveelheid of eenheid niet met zekerheid lezen, zet die op null en " +
  "beschrijf de twijfel kort in 'warnings' — verzin NOOIT getallen. 'serves' is het aantal personen als dat vermeld staat " +
  "(bijv. 'voor 4 personen'), anders null. Splits de bereidingswijze in losse stappen. Gebruik punten als decimaalteken. Alleen de JSON.";

const RECIPE_INSTRUCTION =
  "Lees dit recept uit (naam, ingrediënten met hoeveelheden, bereidingsstappen) en geef de JSON terug.";

export type RecipeSource =
  | { kind: "image"; mediaType: string; data: string }
  | { kind: "pdf"; data: string }
  | { kind: "text"; text: string };

export type ScannedIngredient = {
  name: string;
  qty: number | null;
  unit: string | null;
  // Best-effort normalisatie naar het opslagmodel (per couvert-deling volgt bij opslaan).
  amount: number | null;
  storageUnit: string;
  mode: CostMode;
  // Catalogus-koppeling; geen match ⇒ prijs onbekend (sluit aan op de ongeprijsde-keten).
  matchedId: string | null;
  matchedName: string | null;
  pricePerUnit: number | null;
};

export type ScannedRecipe = {
  dish: string;
  category: string | null;
  serves: number | null;
  ingredients: ScannedIngredient[];
  steps: string[];
  warnings: string[];
};

function recipeUserContent(source: RecipeSource): string | UserContentBlock[] {
  switch (source.kind) {
    case "text":
      return source.text;
    case "image":
      return [
        { type: "image", source: { type: "base64", media_type: source.mediaType, data: source.data } },
        { type: "text", text: RECIPE_INSTRUCTION },
      ];
    case "pdf":
      return [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: source.data } },
        { type: "text", text: RECIPE_INSTRUCTION },
      ];
  }
}

function extractJsonText(res: LlmResponse): string {
  return res.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

// Koppelt een ingrediëntnaam aan een catalogusartikel via dezelfde token-match als
// de factuur-OCR. Geen match ⇒ prijs onbekend (null), zodat het recept in de Lab
// netjes als "onvolledig" verschijnt en de chef de prijs inline kan invullen.
async function matchIngredient(
  name: string,
  locationId: string,
): Promise<{ matchedId: string | null; matchedName: string | null; pricePerUnit: number | null }> {
  const tokens = tokensOf(name);
  if (tokens.length === 0) return { matchedId: null, matchedName: null, pricePerUnit: null };
  const candidates = await prisma.catalogItem.findMany({
    where: { locationId, OR: tokens.map((t) => ({ name: { contains: t, mode: "insensitive" } })) },
    select: { id: true, name: true, price: true },
  });
  const match = bestCandidate(
    tokens,
    candidates.map((c) => ({ id: c.id, name: c.name, price: Number(c.price) })),
  );
  return match
    ? { matchedId: match.id, matchedName: match.name, pricePerUnit: match.price }
    : { matchedId: null, matchedName: null, pricePerUnit: null };
}

export async function scanRecipe(source: RecipeSource, locationId: string): Promise<ScannedRecipe | null> {
  const router = getRouter();
  const res = await router.run(
    "tier2",
    {
      system: RECIPE_OCR_SYSTEM,
      messages: [{ role: "user", content: recipeUserContent(source) }],
      maxTokens: 3000,
    },
    { locationId, action: `recipe:${source.kind}` },
  );

  const parsed = parseExtractedRecipe(extractJsonText(res));
  if (!parsed) return null;

  const ingredients: ScannedIngredient[] = [];
  for (const ing of parsed.ingredients) {
    const storage = toStorageIngredient(ing);
    const match = await matchIngredient(ing.name, locationId);
    ingredients.push({
      name: ing.name,
      qty: ing.qty,
      unit: ing.unit,
      amount: storage.amount,
      storageUnit: storage.unit,
      mode: storage.mode,
      ...match,
    });
  }

  return {
    dish: parsed.dish,
    category: parsed.category,
    serves: parsed.serves,
    ingredients,
    steps: parsed.steps,
    warnings: parsed.warnings,
  };
}
