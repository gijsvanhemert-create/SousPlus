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
  /**
   * Prijs per kg/L (WEIGHT) of per eenheid (PIECE) — snapshot of live.
   * `null` = prijs ONBEKEND (ingrediënt nog niet in de catalogus). De motor
   * behandelt dit NOOIT stilzwijgend als €0: de foodcost van het hele recept
   * wordt dan "onbekend" (null) i.p.v. onterecht te positief.
   */
  pricePerUnit: DecimalInput | null;
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
  /** Kost per g/ml of per portie van de component; `null` = prijs onbekend. */
  unitCost: DecimalInput | null;
}

/**
 * Kost van één component-regel voor één couvert: amount × unitCost.
 * `null` wanneer de kost van de component onbekend is (ongeprijsd ingrediënt
 * ergens in de component-keten) — propageert zo naar de parent-foodcost.
 */
export function componentCost(component: ComponentCost): Decimal | null {
  if (component.unitCost == null) return null;
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

/** Prijs voor de berekening; `null` = onbekend (geen snapshot én geen override). */
function resolvePrice(ing: CostIngredient, overrides?: PriceOverrides): Decimal | null {
  if (overrides && ing.catalogItemId != null) {
    const override =
      overrides instanceof Map ? overrides.get(ing.catalogItemId) : overrides[ing.catalogItemId];
    if (override != null) return toDecimal(override);
  }
  return ing.pricePerUnit == null ? null : toDecimal(ing.pricePerUnit);
}

/**
 * Foodcost van één ingrediënt voor één couvert.
 *   WEIGHT: (amount / 1000) × prijs   (amount in g/ml, prijs per kg/L)
 *   PIECE:  amount × prijs            (amount = aantal, prijs per eenheid)
 * Geeft `null` als de prijs onbekend is (NOOIT stilzwijgend €0).
 */
export function ingredientCost(ing: CostIngredient, overrides?: PriceOverrides): Decimal | null {
  const price = resolvePrice(ing, overrides);
  if (price === null) return null;
  const amount = toDecimal(ing.amount);
  return ing.mode === "PIECE" ? amount.mul(price) : amount.div(THOUSAND).mul(price);
}

/**
 * Foodcost per couvert: som over alle ingrediënten. Geeft `null` zodra ook maar
 * één ingrediënt een onbekende prijs heeft — de foodcost is dan onvolledig en
 * mag niet als een (te lage) waarde worden gepresenteerd.
 */
export function foodcost(ingredients: CostIngredient[], overrides?: PriceOverrides): Decimal | null {
  let sum = ZERO;
  for (const ing of ingredients) {
    const c = ingredientCost(ing, overrides);
    if (c === null) return null;
    sum = sum.add(c);
  }
  return sum;
}

/**
 * Foodcost per couvert incl. componenten — zonder menuprijs, dus veilig voor
 * (sub-)recepten met menuPrice 0 (waar marge niet gedefinieerd is).
 * Geeft `null` als één ingrediënt óf één component (transitief) een onbekende
 * prijs heeft.
 */
export function recipeFoodcost(
  input: { ingredients: CostIngredient[]; components?: ComponentCost[] },
  overrides?: PriceOverrides,
): Decimal | null {
  const ingredientsPerCover = foodcost(input.ingredients, overrides);
  if (ingredientsPerCover === null) return null;
  let total = ingredientsPerCover;
  for (const c of input.components ?? []) {
    const cc = componentCost(c);
    if (cc === null) return null;
    total = total.add(cc);
  }
  return total;
}

/**
 * Volledige kost-/margeberekening voor een receptversie.
 * Dezelfde motor draait de Marge-Waakhond, met `options.overrides` voor
 * gewijzigde leveranciersprijzen.
 *
 * @throws als menuPrice ≤ 0 (marge is dan niet zinvol te bepalen).
 * @throws als de foodcost onvolledig is (een ingrediënt/component zonder prijs);
 *   de marge is dan niet te bepalen. Roep dit alleen aan voor volledig geprijsde
 *   recepten — check vooraf met `recipeFoodcost(...) !== null`.
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

  const foodcostPerCover = recipeFoodcost(input, options.overrides);
  if (foodcostPerCover === null) {
    throw new Error("foodcost onvolledig: één of meer ingrediënten hebben geen bekende prijs");
  }
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
