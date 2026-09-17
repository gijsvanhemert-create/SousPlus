// Recursieve kostprijs-resolver voor componenten/sub-recepten. Puur en DB-vrij,
// dus bruikbaar op de server (getLabRecipes/menu-overzicht) én in de client (live
// herberekening in de Recipe Lab), en testbaar met een handgemaakte graaf.
//
// Model (zie recipe-components memory): elke versie is per couvert gedefinieerd en
// heeft een yield (hoeveel één portie is). Een component pint op een vaste
// kind-versie. De kost per basiseenheid van een component:
//   unitCost(childVersion) = foodcostPerServing(childVersion) / yieldQty(childVersion)
// en een parent-regel kost:  amount × unitCost.
//
// Bestand tegen cycli (bezochte-set), ontbrekende versies en te diepe nesting:
// die dragen 0 bij. Server-side validatie voorkomt cycli al; dit is het vangnet.

import { Decimal } from "decimal.js";
import { ingredientCost, toDecimal, type CostIngredient, type DecimalInput, type PriceOverrides } from "./cost";

export const MAX_COMPONENT_DEPTH = 4;

const ZERO = new Decimal(0);

export type ComponentRef = {
  childVersionId: string;
  amount: DecimalInput; // per couvert van de parent
};

export type CostVersionNode = {
  id: string;
  yieldQty: DecimalInput; // hoeveel één portie is (deler voor unitCost)
  ingredients: CostIngredient[];
  components: ComponentRef[];
};

export type VersionCost = {
  /** Foodcost van één portie van deze versie, inclusief sub-componenten. */
  foodcostPerServing: Decimal;
  /** Kost per basiseenheid (g/ml/portie): foodcostPerServing / yieldQty. */
  unitCost: Decimal;
  /**
   * `false` zodra deze versie (of transitief een sub-component) een ingrediënt
   * zonder bekende prijs bevat. `foodcostPerServing`/`unitCost` zijn dan een
   * PARTIËLE waarde (de ongeprijsde regels dragen 0 bij) en mogen niet als
   * volledige kostprijs worden getoond — consulteer eerst dit vlag.
   */
  priceComplete: boolean;
};

export type ComponentCostOptions = {
  /** Marge-Waakhond: prijs-overrides per catalogItemId, doorgegeven aan de recursie. */
  overrides?: PriceOverrides;
  maxDepth?: number;
};

/**
 * Bereken foodcost/portie én unitCost voor elke versie in de graaf.
 * Memoïsatie maakt diamanten (A→B, A→C, B→C) goedkoop; de graaf is per contract
 * acyclisch (server-side afgedwongen), dus memoïsatie is correct.
 */
export function computeVersionCosts(
  versions: CostVersionNode[],
  options: ComponentCostOptions = {},
): Map<string, VersionCost> {
  const maxDepth = options.maxDepth ?? MAX_COMPONENT_DEPTH;
  const byId = new Map(versions.map((v) => [v.id, v]));
  const memo = new Map<string, VersionCost>();

  // Structurele randgevallen (ontbrekende versie / cyclus / te diep) dragen 0 bij
  // en gelden als "compleet" — dat zijn geen prijs-onbekend-gevallen, maar aparte
  // problemen die elders worden afgevangen.
  const EMPTY: VersionCost = { foodcostPerServing: ZERO, unitCost: ZERO, priceComplete: true };

  function compute(versionId: string, stack: Set<string>, depth: number): VersionCost {
    const node = byId.get(versionId);
    if (!node) return EMPTY; // ontbrekende versie
    const cached = memo.get(versionId);
    if (cached) return cached;
    if (stack.has(versionId) || depth > maxDepth) return EMPTY; // cycle / te diep

    const nextStack = new Set(stack).add(versionId);
    let total = ZERO;
    let priceComplete = true;

    // Ongeprijsde ingrediënten dragen 0 bij aan het (partiële) getal, maar zetten
    // priceComplete op false zodat consumers de waarde niet als volledig lezen.
    for (const ing of node.ingredients) {
      const c = ingredientCost(ing, options.overrides);
      if (c === null) {
        priceComplete = false;
        continue;
      }
      total = total.add(c);
    }

    for (const comp of node.components) {
      const child = compute(comp.childVersionId, nextStack, depth + 1);
      if (!child.priceComplete) priceComplete = false;
      total = total.add(toDecimal(comp.amount).mul(child.unitCost));
    }

    const yieldQty = toDecimal(node.yieldQty);
    const result: VersionCost = {
      foodcostPerServing: total,
      unitCost: yieldQty.isZero() ? ZERO : total.div(yieldQty),
      priceComplete,
    };
    memo.set(versionId, result);
    return result;
  }

  for (const v of versions) compute(v.id, new Set(), 0);
  return memo;
}

/** Kost per basiseenheid van een component, gepind op childVersionId (0 indien onbekend). */
export function unitCostFor(costs: Map<string, VersionCost>, childVersionId: string): Decimal {
  return costs.get(childVersionId)?.unitCost ?? ZERO;
}

/**
 * Is de kostprijs van deze versie volledig geprijsd? `false` als de versie (of
 * transitief een sub-component) een ingrediënt zonder bekende prijs bevat.
 * Een onbekende versie geldt als "compleet" (geen prijsprobleem, ander vangnet).
 */
export function isVersionPriceComplete(costs: Map<string, VersionCost>, childVersionId: string): boolean {
  return costs.get(childVersionId)?.priceComplete ?? true;
}
