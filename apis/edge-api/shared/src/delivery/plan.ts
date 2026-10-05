import type { Queryable } from "../lib/db";
import { parseCents } from "../lib/money";
import type { WeightBand } from "./engine";

/** The two delivery methods (`DeliveryMethod` in @effy/shared-types). */
export const METHOD_SAME_DAY = "same_day";
export const METHOD_STANDARD = "standard";
export type DeliveryMethod = typeof METHOD_SAME_DAY | typeof METHOD_STANDARD;

/** The active shipping-fee plan, resolved to the engine's integer forms. Loaded once per quote. */
export interface Plan {
  id: string;
  roundingStepCents: number;
  floorCents: number;
  capCents: number;
  sameDayFactorMilli: number;
  standardFactorMilli: number;
  /** ring id → distance-slab price. */
  ringPriceCents: ReadonlyMap<string, number>;
  /** Ascending by `upperGrams`; the largest is the open-ended top. */
  weightBands: readonly WeightBand[];
}

/** The method's factor in milli-units. Any method other than same_day is standard. */
export function factorMilli(plan: Plan, method: string): number {
  return method === METHOD_SAME_DAY ? plan.sameDayFactorMilli : plan.standardFactorMilli;
}

/**
 * No fee plan is active — checkout cannot quote a delivery fee and must refuse rather than deliver
 * for free. Activation guarantees exactly one active, complete plan; this is the defensive path
 * for a misconfigured environment.
 */
export class NoActivePlanError extends Error {
  constructor() {
    super("delivery: no active fee plan");
    this.name = "NoActivePlanError";
  }
}

interface PlanRow {
  id: string;
  rounding_step: string;
  floor_amount: string;
  cap_amount: string;
  same_day_factor: string;
  standard_factor: string;
}

export async function loadActivePlan(q: Queryable): Promise<Plan> {
  const row = (
    await q.query<PlanRow>(`
		SELECT id::text AS id, rounding_step::text AS rounding_step, floor_amount::text AS floor_amount,
		       cap_amount::text AS cap_amount, same_day_factor::text AS same_day_factor,
		       standard_factor::text AS standard_factor
		FROM public.delivery_fee_plan WHERE is_active = true`)
  ).rows[0];
  if (!row) throw new NoActivePlanError();

  const prices = await q.query<{ ring_id: string; price_amount: string }>(
    `SELECT ring_id::text AS ring_id, price_amount::text AS price_amount FROM public.delivery_ring_price WHERE plan_id = $1`,
    [row.id],
  );
  const bands = await q.query<{ upper_grams: number; add_amount: string }>(
    `SELECT upper_grams, add_amount::text AS add_amount FROM public.delivery_weight_band WHERE plan_id = $1 ORDER BY upper_grams`,
    [row.id],
  );

  return {
    id: row.id,
    roundingStepCents: parseCents(row.rounding_step),
    floorCents: parseCents(row.floor_amount),
    capCents: parseCents(row.cap_amount),
    sameDayFactorMilli: parseMilli(row.same_day_factor),
    standardFactorMilli: parseMilli(row.standard_factor),
    ringPriceCents: new Map(prices.rows.map((r) => [r.ring_id, parseCents(r.price_amount)])),
    weightBands: bands.rows.map((b) => ({ upperGrams: b.upper_grams, addCents: parseCents(b.add_amount) })),
  };
}

const DIGITS = /^\d+$/;

/**
 * A numeric(_,3) decimal string → integer milli-units: "1.8" → 1800, "1" → 1000, "2.400" → 2400.
 * Digits beyond 3 are truncated (the column is 3-dp).
 */
export function parseMilli(input: string): number {
  let s = input.trim();
  if (s === "") throw new Error("delivery: empty factor");
  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);

  const dot = s.indexOf(".");
  const whole = (dot === -1 ? s : s.slice(0, dot)) || "0";
  const frac = (dot === -1 ? "" : s.slice(dot + 1)).slice(0, 3).padEnd(3, "0");
  if (!DIGITS.test(whole) || !DIGITS.test(frac)) throw new Error(`delivery: bad factor "${input}"`);

  const milli = Number(whole) * 1000 + Number(frac);
  return negative ? -milli : milli;
}
