/**
 * The platform's ONE delivery fee engine (047, rebuilt by 077). PURE — no I/O, no clock, no
 * database — so it is the single, table-testable home of how a customer delivery fee is computed.
 *
 * ⚠ THIS FILE IS THE ONLY PLACE FEE PARTS ARE ADDED UP. Checkout prices with `effyFee`; the
 * back-office simulator calls the same function with a plan loaded by id; nothing else may add a
 * base to a band (`fee.guard.test.ts`). Two sums is how "the simulator said $6 and checkout charged
 * $7" happens.
 *
 * One fee per ORDER — never per supplier — in integer minor units (cents), never floats:
 *
 *     premium  = what the chosen window adds (today's premium + the window's own)
 *     raw      = base + distance band + weight band + premium
 *     delivery = clamp( roundUpToStep(raw), floor, cap )
 *     basket ≥ free-over   → delivery = 0            (the surcharge is waived too)
 *     basket < small-under → + small-order fee       (outside the rounding and the cap)
 *
 * Round UP, never down. Floor and cap are multiples of the step, so every result is.
 */

/** One upper-bound weight slab: a basket of `upperGrams` or less adds `addCents`. */
export interface WeightBand {
  upperGrams: number;
  addCents: number;
}

/**
 * One upper-bound distance slab: a delivery of `upperKm` or less adds `addCents`. `upperKm` is null
 * on the open-ended band — "and beyond" — which is what makes every distance priceable.
 */
export interface DistanceBand {
  upperKm: number | null;
  addCents: number;
}

interface Rounding {
  /** Rounding step (> 0). */
  stepCents: number;
  /** Minimum fee (≥ 0, a multiple of the step). */
  floorCents: number;
  /** Maximum fee (> 0, a multiple of the step, ≥ floor). */
  capCents: number;
}

/** What a "Delivered by Effy" plan prices with. */
export interface EffyPlanValues extends Rounding {
  baseCents: number;
  distanceBands: readonly DistanceBand[];
  /** The largest `upperGrams` is the open-ended top. */
  weightBands: readonly WeightBand[];
  /** Free delivery at or above this basket value; null = never free. */
  freeOverCents: number | null;
  /** A basket BELOW this pays `smallOrderFeeCents` on top; null = no small-order fee. */
  smallOrderUnderCents: number | null;
  smallOrderFeeCents: number;
}

/** What a "Courier delivery" table prices with: a flat amount per order plus weight. No distance. */
export interface CourierPlanValues extends Rounding {
  /** The flat amount per order. */
  baseCents: number;
  weightBands: readonly WeightBand[];
  /** The courier table's OWN free-delivery amount. ⚠ Effy's never applies to a courier order. */
  freeOverCents: number | null;
}

/** A distance no band covers: the plan has no open-ended band. Activation refuses such a plan. */
export class UnpricedDistanceError extends Error {
  constructor(readonly km: number) {
    super(`delivery: no distance band prices ${km} km`);
    this.name = "UnpricedDistanceError";
  }
}

/** A plan with no weight bands at all. Activation refuses such a plan. */
export class UnpricedWeightError extends Error {
  constructor(readonly grams: number) {
    super(`delivery: no weight band prices ${grams} g`);
    this.name = "UnpricedWeightError";
  }
}

/** Every step of one fee, in the order it was built — what staff are shown and what an order keeps. */
export interface FeeBreakdown {
  kind: "effy" | "courier";
  /** Straight-line km from the hub; null for a courier fee, which distance does not affect. */
  km: number | null;
  grams: number;
  basketCents: number;
  baseCents: number;
  distanceCents: number;
  /** The band the distance fell in; null = the open-ended band (and always for a courier fee). */
  distanceBandUpperKm: number | null;
  weightCents: number;
  weightBandUpperGrams: number | null;
  premiumCents: number;
  /** base + distance + weight + premium. */
  rawCents: number;
  roundedCents: number;
  /** Which limit moved the rounded amount, if either did. */
  clamp: "floor" | "cap" | null;
  /** The fee after rounding and limits, BEFORE the free-delivery rule. */
  clampedCents: number;
  /** The same, had no window premium been added — what the "Delivery" line shows. */
  clampedWithoutPremiumCents: number;
  freeApplied: boolean;
  /** The delivery fee charged: `clampedCents`, or 0 when free. */
  deliveryCents: number;
  smallOrderCents: number;
  /** deliveryCents + smallOrderCents — what the order's delivery total is. */
  totalCents: number;
}

export type FeeLineKind = "delivery" | "window_surcharge" | "small_order" | "free_delivery";

/** One customer-facing line. `cents` is negative only for `free_delivery`. */
export interface FeeLine {
  kind: FeeLineKind;
  cents: number;
}

/**
 * What a basket is worth for the two basket rules — defined ONCE (077 FR-005): the goods after any
 * promotion, before any delivery charge, GST included. ⚠ Points are NOT subtracted: they are a way
 * of paying (074), so paying with them never loses a customer their free delivery.
 */
export function basketValueCents(itemSubtotalCents: number, discountCents: number): number {
  return Math.max(0, itemSubtotalCents - discountCents);
}

/**
 * The band `km` falls in: the smallest `upperKm` that is ≥ km — so a distance exactly on a boundary
 * takes the LOWER band — else the open-ended band. Order-independent.
 */
export function distanceBandFor(km: number, bands: readonly DistanceBand[]): DistanceBand {
  let fit: DistanceBand | undefined;
  let open: DistanceBand | undefined;
  for (const b of bands) {
    if (b.upperKm === null) open = b;
    else if (b.upperKm >= km && (!fit || b.upperKm < (fit.upperKm as number))) fit = b;
  }
  const band = fit ?? open;
  if (!band) throw new UnpricedDistanceError(km);
  return band;
}

/**
 * The band `grams` falls in: the smallest `upperGrams` that is ≥ grams, or — heavier than every
 * band — the heaviest one (the open-ended top). Order-independent.
 */
export function weightBandFor(grams: number, bands: readonly WeightBand[]): WeightBand & { open: boolean } {
  let fit: WeightBand | undefined;
  let top: WeightBand | undefined;
  for (const b of bands) {
    if (b.upperGrams >= grams && (!fit || b.upperGrams < fit.upperGrams)) fit = b;
    if (!top || b.upperGrams > top.upperGrams) top = b;
  }
  if (fit) return { ...fit, open: false };
  // ⚠ No band is NOT "adds nothing": that would be delivery made cheaper by a missing row.
  if (!top) throw new UnpricedWeightError(grams);
  return { ...top, open: true };
}

/** Rounded UP to the step, then held between floor and cap. */
function settle(rawCents: number, r: Rounding): { rounded: number; clamped: number; clamp: "floor" | "cap" | null } {
  const rounded = Math.ceil(rawCents / r.stepCents) * r.stepCents;
  if (rounded < r.floorCents) return { rounded, clamped: r.floorCents, clamp: "floor" };
  if (rounded > r.capCents) return { rounded, clamped: r.capCents, clamp: "cap" };
  return { rounded, clamped: rounded, clamp: null };
}

export interface EffyFeeInput {
  /** Straight-line km from the hub to the delivery postcode. */
  km: number;
  /** The whole basket's weight. */
  grams: number;
  /** `basketValueCents(...)`. */
  basketCents: number;
  /** What the chosen window adds; 0 when no window is chosen. */
  premiumCents: number;
  plan: EffyPlanValues;
}

/** The fee for one "Delivered by Effy" order, with every step that built it. */
export function effyFee(input: EffyFeeInput): FeeBreakdown {
  const { plan } = input;
  const distance = distanceBandFor(input.km, plan.distanceBands);
  const weight = weightBandFor(input.grams, plan.weightBands);

  const withoutPremium = plan.baseCents + distance.addCents + weight.addCents;
  const rawCents = withoutPremium + input.premiumCents;
  const settled = settle(rawCents, plan);

  const freeApplied = plan.freeOverCents !== null && input.basketCents >= plan.freeOverCents;
  const deliveryCents = freeApplied ? 0 : settled.clamped;
  const smallOrderCents =
    plan.smallOrderUnderCents !== null && input.basketCents < plan.smallOrderUnderCents ? plan.smallOrderFeeCents : 0;

  return {
    kind: "effy",
    km: input.km,
    grams: input.grams,
    basketCents: input.basketCents,
    baseCents: plan.baseCents,
    distanceCents: distance.addCents,
    distanceBandUpperKm: distance.upperKm,
    weightCents: weight.addCents,
    weightBandUpperGrams: weight.open ? null : weight.upperGrams,
    premiumCents: input.premiumCents,
    rawCents,
    roundedCents: settled.rounded,
    clamp: settled.clamp,
    clampedCents: settled.clamped,
    clampedWithoutPremiumCents: settle(withoutPremium, plan).clamped,
    freeApplied,
    deliveryCents,
    smallOrderCents,
    totalCents: deliveryCents + smallOrderCents,
  };
}

export interface CourierFeeInput {
  grams: number;
  basketCents: number;
  plan: CourierPlanValues;
}

/**
 * The fee for one "Courier delivery" order: the flat amount plus the weight band. ⚠ Distance plays
 * no part, there is no window, and it is free only through the courier table's OWN amount.
 */
export function courierFee(input: CourierFeeInput): FeeBreakdown {
  const { plan } = input;
  const weight = weightBandFor(input.grams, plan.weightBands);
  const rawCents = plan.baseCents + weight.addCents;
  const settled = settle(rawCents, plan);
  const freeApplied = plan.freeOverCents !== null && input.basketCents >= plan.freeOverCents;
  const deliveryCents = freeApplied ? 0 : settled.clamped;

  return {
    kind: "courier",
    km: null,
    grams: input.grams,
    basketCents: input.basketCents,
    baseCents: plan.baseCents,
    distanceCents: 0,
    distanceBandUpperKm: null,
    weightCents: weight.addCents,
    weightBandUpperGrams: weight.open ? null : weight.upperGrams,
    premiumCents: 0,
    rawCents,
    roundedCents: settled.rounded,
    clamp: settled.clamp,
    clampedCents: settled.clamped,
    clampedWithoutPremiumCents: settled.clamped,
    freeApplied,
    deliveryCents,
    smallOrderCents: 0,
    totalCents: deliveryCents,
  };
}

/**
 * The lines a customer reads, which ALWAYS sum to `totalCents` (077 FR-028). A zero line is omitted.
 *
 * ⚠ The surcharge line is what the window ACTUALLY added — the fee with the premium less the fee
 * without — not the premium's nominal amount. A fee already at the plan's maximum does not rise for
 * a dearer window, and a line claiming it did would not add up.
 */
export function feeLines(b: FeeBreakdown): FeeLine[] {
  const lines: FeeLine[] = [];
  const surcharge = b.clampedCents - b.clampedWithoutPremiumCents;
  if (b.clampedWithoutPremiumCents > 0) lines.push({ kind: "delivery", cents: b.clampedWithoutPremiumCents });
  if (surcharge > 0) lines.push({ kind: "window_surcharge", cents: surcharge });
  if (b.smallOrderCents > 0) lines.push({ kind: "small_order", cents: b.smallOrderCents });
  if (b.freeApplied && b.clampedCents > 0) lines.push({ kind: "free_delivery", cents: -b.clampedCents });
  return lines;
}
