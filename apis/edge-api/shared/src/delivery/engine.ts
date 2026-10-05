/**
 * The platform's ONE delivery fee engine (047). PURE — no I/O, no clock, no database — so it is the
 * single, table-testable home of how a customer delivery fee is computed. The back-office console
 * validates a plan's completeness but never reimplements this.
 *
 * All arithmetic is in integer minor units (cents), never floats. The method factor is carried in
 * milli-units (numeric(6,3) × 1000) so `factor × base` stays exact, and the result is rounded UP to
 * the step by taking the ceiling on milli-cents — a fractional cent is never shaved off first.
 */

/** One upper-bound weight slab: a package of `upperGrams` or less adds `addCents`. */
export interface WeightBand {
  upperGrams: number;
  addCents: number;
}

export interface FeeInputs {
  /** The destination ring's price component for the active plan. */
  ringPriceCents: number;
  /** Sum of the package's item weights (> 0). */
  packageGrams: number;
  /** The plan's weight slabs; the largest `upperGrams` is the open-ended top. */
  weightBands: readonly WeightBand[];
  /** The method factor × 1000 (same_day ≥ standard; > 0). */
  factorMilli: number;
  /** Rounding step (> 0). */
  stepCents: number;
  /** Minimum fee (≥ 0, a multiple of step). */
  floorCents: number;
  /** Maximum fee (> 0, a multiple of step, ≥ floor). */
  capCents: number;
}

/**
 * The GST-inclusive, snapped-up, clamped delivery fee in integer cents:
 *
 *     fee = clamp( roundUpToStep( factor × (ringPrice + weightAdd) ), floor, cap )
 *
 * Because floor and cap are themselves multiples of the step, EVERY result is a multiple of the
 * step — including a floored or capped one. Never below what the rule produced (round UP, never
 * down), never below the floor, never above the cap.
 */
export function fee(input: FeeInputs): number {
  const base = input.ringPriceCents + weightAddCents(input.packageGrams, input.weightBands);

  // raw × 1000, kept integer so no fractional cent is lost on the downside before rounding UP.
  const rawMilli = input.factorMilli * base;
  const stepMilli = input.stepCents * 1000;

  const steps = Math.floor((rawMilli + stepMilli - 1) / stepMilli);
  const snapped = steps * input.stepCents;

  return Math.min(Math.max(snapped, input.floorCents), input.capCents);
}

/**
 * The slab add for `grams`: the smallest band whose `upperGrams` is ≥ grams, or — if the package is
 * heavier than every band — the band with the largest `upperGrams` (the open-ended top).
 * Order-independent, so bands returned unsorted still price correctly.
 */
export function weightAddCents(grams: number, bands: readonly WeightBand[]): number {
  let fit: WeightBand | undefined;
  let top: WeightBand | undefined;
  for (const b of bands) {
    if (b.upperGrams >= grams && (!fit || b.upperGrams < fit.upperGrams)) fit = b;
    if (!top || b.upperGrams > top.upperGrams) top = b;
  }
  return (fit ?? top)?.addCents ?? 0;
}
