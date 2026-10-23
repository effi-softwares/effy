/**
 * The one delivery fee engine: pure, and the only place fee parts are added up (`fee.guard.test.ts`).
 * Checkout prices with `effyFee`; the back-office simulator calls the same function with a plan
 * loaded by id. One fee per order, in integer cents:
 *
 *  premium = what the chosen window adds (today's premium + the window's own)
 *  raw = base + distance band + weight band + premium
 *  delivery = clamp( roundUpToStep(raw), floor, cap )
 *  basket ≥ free-over → delivery = 0 (the surcharge is waived too)
 *  basket < small-under → + small-order fee (outside the rounding and the cap)
 *
 * Round up, never down. Floor and cap are multiples of the step, so every result is.
 */

/** A basket of `upperGrams` or less adds `addCents`. */
export interface WeightBand {
  upperGrams: number;
  addCents: number;
}

/** A delivery of `upperKm` or less adds `addCents`; `upperKm` null is the open-ended band. */
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

export interface EffyPlanValues extends Rounding {
  baseCents: number;
  distanceBands: readonly DistanceBand[];
  /** The largest `upperGrams` is the open-ended top. */
  weightBands: readonly WeightBand[];
  /** Free at or above this basket value; null = never free. */
  freeOverCents: number | null;
  /** A basket below this pays `smallOrderFeeCents` on top; null = none. */
  smallOrderUnderCents: number | null;
  smallOrderFeeCents: number;
}

/** A flat amount per order plus weight; no distance. */
export interface CourierPlanValues extends Rounding {
  baseCents: number;
  weightBands: readonly WeightBand[];
  /** The courier table's own free-delivery amount; Effy's never applies to a courier order. */
  freeOverCents: number | null;
}

/** No open-ended band; activation refuses such a plan. */
export class UnpricedDistanceError extends Error {
  constructor(readonly km: number) {
    super(`delivery: no distance band prices ${km} km`);
    this.name = "UnpricedDistanceError";
  }
}

/** No weight bands at all; activation refuses such a plan. */
export class UnpricedWeightError extends Error {
  constructor(readonly grams: number) {
    super(`delivery: no weight band prices ${grams} g`);
    this.name = "UnpricedWeightError";
  }
}

/** Every step of one fee, in order: what staff are shown and what an order keeps. */
export interface FeeBreakdown {
  kind: "effy" | "courier";
  /** null for a courier fee. */
  km: number | null;
  grams: number;
  basketCents: number;
  baseCents: number;
  distanceCents: number;
  /** null = the open-ended band (and always for a courier fee). */
  distanceBandUpperKm: number | null;
  weightCents: number;
  weightBandUpperGrams: number | null;
  premiumCents: number;
  /** base + distance + weight + premium. */
  rawCents: number;
  roundedCents: number;
  /** Which limit moved the rounded amount, if either did. */
  clamp: "floor" | "cap" | null;
  /** After rounding and limits, before the free-delivery rule. */
  clampedCents: number;
  /** The same without the window premium: the "Delivery" line. */
  clampedWithoutPremiumCents: number;
  freeApplied: boolean;
  /** `clampedCents`, or 0 when free. */
  deliveryCents: number;
  smallOrderCents: number;
  /** deliveryCents + smallOrderCents: the order's delivery total. */
  totalCents: number;
}

export type FeeLineKind = "delivery" | "window_surcharge" | "small_order" | "free_delivery";

/** `cents` is negative only for `free_delivery`. */
export interface FeeLine {
  kind: FeeLineKind;
  cents: number;
}

/** Goods after promotions, before delivery, GST included. Points are not subtracted: they are a way of paying. */
export function basketValueCents(itemSubtotalCents: number, discountCents: number): number {
  return Math.max(0, itemSubtotalCents - discountCents);
}

/** The smallest `upperKm` ≥ km (a boundary takes the lower band), else the open-ended band. */
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

/** The smallest `upperGrams` ≥ grams, or the heaviest band. */
export function weightBandFor(grams: number, bands: readonly WeightBand[]): WeightBand & { open: boolean } {
  let fit: WeightBand | undefined;
  let top: WeightBand | undefined;
  for (const b of bands) {
    if (b.upperGrams >= grams && (!fit || b.upperGrams < fit.upperGrams)) fit = b;
    if (!top || b.upperGrams > top.upperGrams) top = b;
  }
  if (fit) return { ...fit, open: false };
  // No band is not "adds nothing": that would make a missing row cheaper.
  if (!top) throw new UnpricedWeightError(grams);
  return { ...top, open: true };
}

/** Rounded up to the step, then held between floor and cap. */
function settle(rawCents: number, r: Rounding): { rounded: number; clamped: number; clamp: "floor" | "cap" | null } {
  const rounded = Math.ceil(rawCents / r.stepCents) * r.stepCents;
  if (rounded < r.floorCents) return { rounded, clamped: r.floorCents, clamp: "floor" };
  if (rounded > r.capCents) return { rounded, clamped: r.capCents, clamp: "cap" };
  return { rounded, clamped: rounded, clamp: null };
}

export interface EffyFeeInput {
  km: number;
  grams: number;
  /** `basketValueCents(...)`. */
  basketCents: number;
  /** 0 when no window is chosen. */
  premiumCents: number;
  plan: EffyPlanValues;
}

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

/** The flat amount plus the weight band; no distance or window, and free only by the courier table's own amount. */
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
 * Customer lines, always summing to `totalCents`; zero lines omitted. The surcharge line is what the
 * window actually added, not its nominal premium, so the lines add up at the cap.
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
