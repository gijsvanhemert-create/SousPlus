import { prisma } from "@/server/db";
import { recipeCost, recipeFoodcost, type CostMode } from "@/lib/cost";
import { switchSupplierFor } from "@/server/supplier-switch";

// Marge-Waakhond. Detecteert margebedreigingen na een prijscascade (re-sync /
// OCR) en biedt twee herstelacties: leverancier wisselen of de prijs accepteren
// (menuprijs bijstellen). Locatie-gescopet.

export const CRITICAL_MARGIN = 70;
const RESTORE_TARGET = 71; // marge waarnaar "prijs accepteren" herstelt

export type PriceChange = { keyword: string; name: string; oldPrice: number; newPrice: number };

export type AlertView = {
  id: string;
  ingredient: string;
  deltaPct: number;
  dish: string | null;
  affectedRecipeId: string | null;
  currentMarginPct: number | null;
  createdAt: string;
};

type RecipeMargin = { id: string; dish: string; menuPrice: number; marginPct: number | null; foodcost: number; ingredients: string[] };

async function recipeMargins(locationId: string): Promise<RecipeMargin[]> {
  const recipes = await prisma.recipe.findMany({
    where: { locationId },
    include: { activeVersion: { include: { ingredients: true } } },
  });
  return recipes.map((r) => {
    const v = r.activeVersion;
    // Alleen echte menu-gerechten met een positieve prijs hebben een zinvolle marge;
    // sub-recepten (menuPrice 0) slaan we over (recipeCost werpt anders).
    const cost =
      v && v.ingredients.length > 0 && Number(r.menuPrice) > 0
        ? recipeCost({
            menuPrice: r.menuPrice.toString(),
            ingredients: v.ingredients.map((i) => ({
              amount: i.amount.toString(),
              mode: i.mode as CostMode,
              pricePerUnit: i.pricePerUnit.toString(),
            })),
          })
        : null;
    return {
      id: r.id,
      dish: r.dish,
      menuPrice: Number(r.menuPrice),
      marginPct: cost ? cost.marginPct.toNumber() : null,
      foodcost: cost ? cost.foodcostPerCover.toNumber() : 0,
      ingredients: v?.ingredients.map((i) => i.name.toLowerCase()) ?? [],
    };
  });
}

function primaryKeyword(ingredient: string): string {
  const words = ingredient.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  return words[0] ?? ingredient;
}

/** Maak alerts voor recepten die door een prijsstijging onder de kritieke marge zakken. */
export async function evaluateMarginAlerts(locationId: string, changes: PriceChange[]): Promise<void> {
  const increases = changes.filter((c) => c.newPrice > c.oldPrice);
  if (increases.length === 0) return;

  const margins = await recipeMargins(locationId);
  for (const m of margins) {
    if (m.marginPct == null || m.marginPct >= CRITICAL_MARGIN) continue;

    // Schuldige: de prijsstijging waarvan het keyword in dit recept voorkomt.
    const culprit = increases
      .filter((c) => m.ingredients.some((name) => name.includes(c.keyword)))
      .sort((a, b) => b.newPrice / b.oldPrice - a.newPrice / a.oldPrice)[0];
    if (!culprit) continue;

    const existing = await prisma.marginAlert.findFirst({
      where: { locationId, affectedRecipeId: m.id, resolved: false },
      select: { id: true },
    });
    if (existing) continue;

    const deltaPct = ((culprit.newPrice - culprit.oldPrice) / culprit.oldPrice) * 100;
    await prisma.marginAlert.create({
      data: { locationId, ingredient: culprit.name, deltaPct: deltaPct.toFixed(2), affectedRecipeId: m.id, resolved: false },
    });
  }
}

export async function getOpenAlerts(locationId: string): Promise<AlertView[]> {
  const [alerts, margins] = await Promise.all([
    prisma.marginAlert.findMany({ where: { locationId, resolved: false }, orderBy: { createdAt: "desc" } }),
    recipeMargins(locationId),
  ]);
  return alerts.map((a) => {
    const m = margins.find((x) => x.id === a.affectedRecipeId);
    return {
      id: a.id,
      ingredient: a.ingredient,
      deltaPct: Number(a.deltaPct),
      dish: m?.dish ?? null,
      affectedRecipeId: a.affectedRecipeId,
      currentMarginPct: m?.marginPct ?? null,
      createdAt: a.createdAt.toISOString(),
    };
  });
}

// "switch"/"accept" = de twee snelle acties uit het bel-paneel; "advise" = de
// alert sluiten met een vrije toelichting (de door Chef Auguste gekozen aanpak,
// bv. een portie- of prijsaanpassing die hij zelf via de andere tools uitvoerde).
export type ResolveAction = "switch" | "accept" | "advise";

export async function resolveAlert(
  locationId: string,
  alertId: string,
  action: ResolveAction,
  note?: string,
): Promise<{ message: string }> {
  const alert = await prisma.marginAlert.findFirst({ where: { id: alertId, locationId } });
  if (!alert) throw new Error("Waarschuwing niet gevonden in deze locatie.");
  if (alert.resolved) return { message: "Deze waarschuwing is al opgelost." };

  // advise: geen prijs-/leverancierslogica hier — Chef Auguste heeft de concrete
  // wijziging al via de juiste tool doorgevoerd; we leggen enkel zijn aanpak vast.
  if (action === "advise") {
    const resolution = note?.trim() ? `Advies Chef Auguste — ${note.trim()}` : "Opgelost via Chef Auguste";
    await prisma.marginAlert.update({ where: { id: alertId }, data: { resolved: true, resolution } });
    return { message: resolution };
  }

  if (action === "switch") {
    const res = await switchSupplierFor(locationId, primaryKeyword(alert.ingredient));
    await prisma.marginAlert.update({
      where: { id: alertId },
      data: { resolved: true, resolution: res.switched ? `Leverancier gewisseld — ${res.detail}` : res.message },
    });
    return { message: res.message };
  }

  // accept: stel de menuprijs bij zodat de marge terug boven de kritieke grens komt.
  if (alert.affectedRecipeId) {
    const recipe = await prisma.recipe.findFirst({
      where: { id: alert.affectedRecipeId, locationId },
      include: { activeVersion: { include: { ingredients: true } } },
    });
    if (recipe?.activeVersion) {
      // Alleen de foodcost nodig (geen marge) → recipeFoodcost werpt niet bij prijs 0.
      const foodcost = recipeFoodcost({
        ingredients: recipe.activeVersion.ingredients.map((i) => ({
          amount: i.amount.toString(),
          mode: i.mode as CostMode,
          pricePerUnit: i.pricePerUnit.toString(),
        })),
      }).toNumber();
      const newPrice = Math.ceil((foodcost / (1 - RESTORE_TARGET / 100)) * 100) / 100;
      await prisma.recipe.update({ where: { id: recipe.id }, data: { menuPrice: newPrice.toFixed(2) } });
      await prisma.marginAlert.update({
        where: { id: alertId },
        data: { resolved: true, resolution: `Menuprijs bijgesteld naar €${newPrice.toFixed(2)}` },
      });
      return { message: `Menuprijs bijgesteld naar €${newPrice.toFixed(2).replace(".", ",")} — marge hersteld.` };
    }
  }

  await prisma.marginAlert.update({ where: { id: alertId }, data: { resolved: true, resolution: "Prijs geaccepteerd" } });
  return { message: "Prijs geaccepteerd." };
}
