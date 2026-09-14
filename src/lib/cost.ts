// Foodcost-/margemotor — pure, los geteste functies (fase 2).
//
// Bron van waarheid is het prototype (SousPlusPremiumApp.jsx):
//   perCoverCost(i) = i.mode === "piece" ? i.g * prijs : (i.g / 1000) * prijs
//   foodcost(v)     = som van perCoverCost over de ingrediënten
//   marge           = (menuPrice - foodcost) / menuPrice
//
// Geld rekenen we met Decimal (decimal.js) — nooit met floats. Prisma's
// `Decimal` is op decimal.js gebouwd; instanties daarvan worden hier veilig
// genormaliseerd, zodat de motor direct op database-rijen kan rekenen zonder
// Prisma te importeren (blijft puur en testbaar zonder DB).

import { Decimal } from "decimal.js";

/** WEIGHT = prijs per kg/L; PIECE = prijs per eenheid. Matcht de Prisma-enum. */
export type CostMode = "WEIGHT" | "PIECE";

/**
 * Alles wat een Decimal kan worden: een getal, een string, een decimal.js
 * Decimal, of een Prisma.Decimal (ander decimal.js-build → via toString()).
 */
export type DecimalInput = number | string | Decimal | { toString(): string };

/** Eén ingrediëntregel zoals nodig voor de kostprijsberekening (per couvert). */
export interface CostIngredient {
  /** Optionele koppeling naar de catalogus; sleutel voor prijs-overrides (Waakhond). */
  catalogItemId?: string | null;
  name?: string;
  /** Gram/ml (WEIGHT) of aantal (PIECE). */
  amount: DecimalInput;
  mode: CostMode;
  /** Prijs per kg/L (WEIGHT) of per eenheid (PIECE) — snapshot of live. */
  pricePerUnit: DecimalInput;
}

/** Map catalogItemId → nieuwe prijs-per-eenheid (voor de Marge-Waakhond). */
export type PriceOverrides = Map<string, DecimalInput> | Record<string, DecimalInput>;

/**
 * Een component/sub-recept-regel voor de kostprijs. `unitCost` is de al berekende
 * kost per basiseenheid van de component (g/ml of per portie) — zie
 * lib/component-cost.ts, die de recursie + yield-deling doet. De regelkost is dan
 * simpelweg amount × unitCost.
 */
export interface ComponentCost {
  amount: DecimalInput; // per couvert van de parent
  unitCost: DecimalInput; // kost per g/ml of per portie van de component
}

/** Kost van één component-regel voor één couvert: amount × unitCost. */
export function componentCost(component: ComponentCost): Decimal {
  return toDecimal(component.amount).mul(toDecimal(component.unitCost));
}

export interface RecipeCostInput {
  menuPrice: DecimalInput;
  ingredients: CostIngredient[];
  /** Optionele sub-recepten; hun kosten tellen mee in de foodcost per couvert. */
  components?: ComponentCost[];
}

export interface RecipeCostOptions {
  /** Aantal couverts voor de totalen; standaard 1. */
  covers?: number;
  /** Live prijswijzigingen per catalogItemId; herrekent de marge (Waakhond). */
  overrides?: PriceOverrides;
}

export interface RecipeCost {
  /** Foodcost van één couvert. */
  foodcostPerCover: Decimal;
  menuPrice: Decimal;
  /** menuPrice − foodcost (per couvert). */
  grossProfitPerCover: Decimal;
  /** (menuPrice − foodcost) / menuPrice, als fractie (0..1). */
  marginRatio: Decimal;
  /** Marge in procenten (marginRatio × 100). */
  marginPct: Decimal;
  /** Foodcost als percentage van de menuprijs. */
  foodcostPct: Decimal;
  covers: number;
  foodcostTotal: Decimal;
  revenueTotal: Decimal;
  grossProfitTotal: Decimal;
}

const ZERO = new Decimal(0);
const THOUSAND = new Decimal(1000);
const HUNDRED = new Decimal(100);

/** Normaliseer elke ondersteunde invoer naar een decimal.js Decimal. */
export function toDecimal(value: DecimalInput): Decimal {
  if (value instanceof Decimal) return value;
  if (typeof value === "number" || typeof value === "string") return new Decimal(value);
  // Prisma.Decimal of ander decimal.js-build: stringificeren is verliesvrij.
  return new Decimal(value.toString());
}

function resolvePrice(ing: CostIngredient, overrides?: PriceOverrides): Decimal {
  if (overrides && ing.catalogItemId != null) {
    const override =
      overrides instanceof Map ? overrides.get(ing.catalogItemId) : overrides[ing.catalogItemId];
    if (override != null) return toDecimal(override);
  }
  return toDecimal(ing.pricePerUnit);
}

/**
 * Foodcost van één ingrediënt voor één couvert.
 *   WEIGHT: (amount / 1000) × prijs   (amount in g/ml, prijs per kg/L)
 *   PIECE:  amount × prijs            (amount = aantal, prijs per eenheid)
 */
export function ingredientCost(ing: CostIngredient, overrides?: PriceOverrides): Decimal {
  const amount = toDecimal(ing.amount);
  const price = resolvePrice(ing, overrides);
  return ing.mode === "PIECE" ? amount.mul(price) : amount.div(THOUSAND).mul(price);
}

/** Foodcost per couvert: som over alle ingrediënten. */
export function foodcost(ingredients: CostIngredient[], overrides?: PriceOverrides): Decimal {
  return ingredients.reduce((sum, ing) => sum.add(ingredientCost(ing, overrides)), ZERO);
}

/**
 * Volledige kost-/margeberekening voor een receptversie.
 * Dezelfde motor draait de Marge-Waakhond, met `options.overrides` voor
 * gewijzigde leveranciersprijzen.
 *
 * @throws als menuPrice ≤ 0 (marge is dan niet zinvol te bepalen).
 */
export function recipeCost(input: RecipeCostInput, options: RecipeCostOptions = {}): RecipeCost {
  const covers = options.covers ?? 1;
  if (!Number.isFinite(covers) || covers < 1) {
    throw new Error("aantal couverts moet een geheel getal ≥ 1 zijn");
  }

  const menuPrice = toDecimal(input.menuPrice);
  if (menuPrice.lte(0)) {
    throw new Error("menuPrice moet groter dan 0 zijn voor margeberekening");
  }

  const ingredientsPerCover = foodcost(input.ingredients, options.overrides);
  const componentsPerCover = (input.components ?? []).reduce(
    (sum, c) => sum.add(componentCost(c)),
    ZERO,
  );
  const foodcostPerCover = ingredientsPerCover.add(componentsPerCover);
  const grossProfitPerCover = menuPrice.sub(foodcostPerCover);
  const marginRatio = grossProfitPerCover.div(menuPrice);

  return {
    foodcostPerCover,
    menuPrice,
    grossProfitPerCover,
    marginRatio,
    marginPct: marginRatio.mul(HUNDRED),
    foodcostPct: foodcostPerCover.div(menuPrice).mul(HUNDRED),
    covers,
    foodcostTotal: foodcostPerCover.mul(covers),
    revenueTotal: menuPrice.mul(covers),
    grossProfitTotal: grossProfitPerCover.mul(covers),
  };
}

/** Marge-Waakhond: marge onder de kritieke grens (standaard 70%)? */
export function isMarginCritical(cost: RecipeCost, thresholdPct: DecimalInput = 70): boolean {
  return cost.marginPct.lt(toDecimal(thresholdPct));
}
