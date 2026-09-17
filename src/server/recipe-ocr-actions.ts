"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { getTenant } from "@/server/tenant";
import { CostMode } from "@/generated/prisma/enums";
import { perCoverAmount } from "@/lib/recipe-ocr-parse";
import { scanRecipe, type RecipeSource, type ScannedRecipe } from "./recipe-ocr";

// Foto-/PDF-upload van een bestaand recept → gestructureerde extractie (Tier 2).
// Muteert niets; het opslaan volgt in een aparte, bevestigde stap (fase 2).
const fileSchema = z.object({
  kind: z.enum(["image", "pdf"]),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  data: z.string().min(1).max(14_000_000),
});

export async function scanRecipeFileAction(input: {
  kind: "image" | "pdf";
  mediaType: string;
  data: string;
}): Promise<{ recipe: ScannedRecipe | null }> {
  const { locationId } = await getTenant();
  const parsed = fileSchema.parse(input);
  const source: RecipeSource =
    parsed.kind === "pdf"
      ? { kind: "pdf", data: parsed.data }
      : { kind: "image", mediaType: parsed.mediaType, data: parsed.data };
  const recipe = await scanRecipe(source, locationId);
  return { recipe };
}

// --- Opslaan van het (gecorrigeerde) recept in de Recipe Lab -----------------

const saveSchema = z.object({
  dish: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(80).optional(),
  serves: z.number().int().positive().nullable().optional(),
  // Zijn de hoeveelheden per persoon of totaal voor 'serves' personen?
  portionBasis: z.enum(["per_person", "total"]),
  menuPrice: z.number().nonnegative().max(100_000).optional(),
  ingredients: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        amount: z.number().nonnegative().nullable(),
        unit: z.string().trim().min(1).max(30),
        mode: z.enum(["WEIGHT", "PIECE"]),
        catalogItemId: z.string().nullable().optional(),
        pricePerUnit: z.number().nonnegative().nullable().optional(),
      }),
    )
    .max(100),
  steps: z.array(z.string().trim().min(1).max(2000)).max(100),
});

export type SaveScannedRecipeResult =
  | { ok: true; recipeId: string; dish: string }
  | { ok: false; error: string };

export async function saveScannedRecipeAction(input: z.input<typeof saveSchema>): Promise<SaveScannedRecipeResult> {
  const { locationId } = await getTenant();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ongeldige invoer — controleer naam, ingrediënten en stappen." };
  const d = parsed.data;
  const serves = d.serves ?? null;

  // Alleen catalogus-koppelingen uit déze locatie behouden (verhindert een stale/
  // vreemde id die de opslag zou breken of cross-tenant zou koppelen).
  const providedIds = [...new Set(d.ingredients.map((i) => i.catalogItemId).filter((x): x is string => !!x))];
  const validIds = new Set(
    providedIds.length
      ? (await prisma.catalogItem.findMany({ where: { locationId, id: { in: providedIds } }, select: { id: true } })).map(
          (c) => c.id,
        )
      : [],
  );

  const ingredientsCreate = d.ingredients.map((i) => {
    const perCover = perCoverAmount(i.amount, serves, d.portionBasis);
    // Onbekende hoeveelheid ⇒ de regel is niet te kostprijzen. We representeren dat
    // als prijs onbekend (null) — nooit als een stille €0-bijdrage — zodat het
    // recept in de Lab als "onvolledig" verschijnt tot de chef amount + prijs invult.
    const known = perCover != null;
    const catalogItemId = known && i.catalogItemId && validIds.has(i.catalogItemId) ? i.catalogItemId : null;
    const pricePerUnit = known && i.pricePerUnit != null ? i.pricePerUnit.toFixed(2) : null;
    return {
      name: i.name,
      amount: (perCover ?? 0).toFixed(3),
      unit: i.unit,
      mode: i.mode === "PIECE" ? CostMode.PIECE : CostMode.WEIGHT,
      catalogItemId,
      pricePerUnit,
    };
  });

  try {
    const recipe = await prisma.recipe.create({
      data: {
        locationId,
        dish: d.dish,
        category: d.category ?? "Overig",
        menuPrice: (d.menuPrice ?? 0).toFixed(2),
      },
      select: { id: true },
    });
    const version = await prisma.recipeVersion.create({
      data: {
        recipeId: recipe.id,
        label: "v1.0",
        name: "Geïmporteerd",
        note: "Geïmporteerd via recept-scan.",
        prepTimeMin: 0,
        steps: d.steps,
        ingredients: { create: ingredientsCreate },
      },
      select: { id: true },
    });
    await prisma.recipe.update({ where: { id: recipe.id }, data: { activeVersionId: version.id } });

    revalidatePath("/lab");
    revalidatePath("/library");
    revalidatePath("/matrix");
    return { ok: true, recipeId: recipe.id, dish: d.dish };
  } catch (err) {
    const code = (err as { code?: string }).code;
    console.error(JSON.stringify({ at: "recipe.saveScanned", code: code ?? null, locationId, dish: d.dish }), err);
    if (code === "P2003") {
      return { ok: false, error: "Je sessie lijkt verlopen (locatie niet gevonden). Log opnieuw in en probeer het opnieuw." };
    }
    return { ok: false, error: "Opslaan is mislukt. Probeer het later opnieuw." };
  }
}
