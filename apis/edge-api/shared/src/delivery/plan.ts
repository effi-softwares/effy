import type { Queryable } from "../lib/db";
import { parseCents } from "../lib/money";
import type { CourierPlanValues, DistanceBand, EffyPlanValues, WeightBand } from "./engine";

/** A method has no price: it only says whether a package goes out today or on a later day. */
export const METHOD_SAME_DAY = "same_day";
export const METHOD_STANDARD = "standard";
export type DeliveryMethod = typeof METHOD_SAME_DAY | typeof METHOD_STANDARD;

/** One plan of each kind is active. */
export type PlanKind = "effy" | "courier";

/** Resolved to integer forms, loaded once per quote. Values only: adding them up is the engine's. */
export interface Plan {
  id: string;
  name: string;
  kind: PlanKind;
  isActive: boolean;
  /** Set once ever active; a draft has none. */
  activatedAt: Date | null;
  baseCents: number;
  /** Effy plans only. */
  distanceBands: readonly DistanceBand[];
  /** Ascending; the largest is the open-ended top. */
  weightBands: readonly WeightBand[];
  freeOverCents: number | null;
  smallOrderUnderCents: number | null;
  smallOrderFeeCents: number;
  /** Added when the window is today. */
  todayPremiumCents: number;
  /** slot id → what that window adds on any day. */
  slotPremiumCents: ReadonlyMap<string, number>;
  stepCents: number;
  floorCents: number;
  capCents: number;
}

export function effyValues(plan: Plan): EffyPlanValues {
  return {
    baseCents: plan.baseCents,
    distanceBands: plan.distanceBands,
    weightBands: plan.weightBands,
    freeOverCents: plan.freeOverCents,
    smallOrderUnderCents: plan.smallOrderUnderCents,
    smallOrderFeeCents: plan.smallOrderFeeCents,
    stepCents: plan.stepCents,
    floorCents: plan.floorCents,
    capCents: plan.capCents,
  };
}

export function courierValues(plan: Plan): CourierPlanValues {
  return {
    baseCents: plan.baseCents,
    weightBands: plan.weightBands,
    freeOverCents: plan.freeOverCents,
    stepCents: plan.stepCents,
    floorCents: plan.floorCents,
    capCents: plan.capCents,
  };
}

/** The today premium when the window is today, plus the window's own. No window adds nothing. */
export function windowPremiumCents(plan: Plan, slotId: string | null, windowIsToday: boolean): number {
  if (slotId === null) return 0;
  return (windowIsToday ? plan.todayPremiumCents : 0) + (plan.slotPremiumCents.get(slotId) ?? 0);
}

/** No active plan: checkout must refuse rather than deliver free. Defensive: activation keeps one per kind. */
export class NoActivePlanError extends Error {
  constructor(kind: PlanKind = "effy") {
    super(`delivery: no active ${kind} fee plan`);
    this.name = "NoActivePlanError";
  }
}

interface PlanRow {
  id: string;
  name: string;
  kind: PlanKind;
  is_active: boolean;
  activated_at: Date | null;
  base_amount: string;
  free_over_amount: string | null;
  small_order_under_amount: string | null;
  small_order_fee_amount: string | null;
  today_premium_amount: string;
  rounding_step: string;
  floor_amount: string;
  cap_amount: string;
}

const PLAN_COLUMNS = `
		id::text AS id, name, kind, is_active, activated_at,
		base_amount::text AS base_amount, free_over_amount::text AS free_over_amount,
		small_order_under_amount::text AS small_order_under_amount,
		small_order_fee_amount::text AS small_order_fee_amount,
		today_premium_amount::text AS today_premium_amount,
		rounding_step::text AS rounding_step, floor_amount::text AS floor_amount, cap_amount::text AS cap_amount`;

/** Throws `NoActivePlanError` when there is none. */
export async function loadActivePlan(q: Queryable, kind: PlanKind = "effy"): Promise<Plan> {
  const row = (
    await q.query<PlanRow>(`SELECT ${PLAN_COLUMNS} FROM public.delivery_fee_plan WHERE is_active AND kind = $1`, [kind])
  ).rows[0];
  if (!row) throw new NoActivePlanError(kind);
  return withBands(q, row);
}

/** Draft, active or retired (the simulator); `null` when unknown. */
export async function loadPlan(q: Queryable, id: string): Promise<Plan | null> {
  const row = (await q.query<PlanRow>(`SELECT ${PLAN_COLUMNS} FROM public.delivery_fee_plan WHERE id = $1`, [id])).rows[0];
  return row ? withBands(q, row) : null;
}

async function withBands(q: Queryable, row: PlanRow): Promise<Plan> {
  const [distance, weight, premiums] = await Promise.all([
    q.query<{ upper_km: string | null; add_amount: string }>(
      `SELECT upper_km::text AS upper_km, add_amount::text AS add_amount FROM public.delivery_distance_band WHERE plan_id = $1 ORDER BY upper_km NULLS LAST`,
      [row.id],
    ),
    q.query<{ upper_grams: number; add_amount: string }>(
      `SELECT upper_grams, add_amount::text AS add_amount FROM public.delivery_weight_band WHERE plan_id = $1 ORDER BY upper_grams`,
      [row.id],
    ),
    // A switched-off window's premium never applies.
    q.query<{ slot_id: string; add_amount: string }>(
      `SELECT p.slot_id::text AS slot_id, p.add_amount::text AS add_amount
         FROM public.delivery_slot_premium p
         -- availability-exempt: public.delivery_slot - a delivery window's lifecycle, not a product's.
         JOIN public.delivery_slot s ON s.id = p.slot_id AND s.status = 'active'
        WHERE p.plan_id = $1`,
      [row.id],
    ),
  ]);

  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    isActive: row.is_active,
    activatedAt: row.activated_at,
    baseCents: parseCents(row.base_amount),
    distanceBands: distance.rows.map((b) => ({ upperKm: b.upper_km === null ? null : Number(b.upper_km), addCents: parseCents(b.add_amount) })),
    weightBands: weight.rows.map((b) => ({ upperGrams: b.upper_grams, addCents: parseCents(b.add_amount) })),
    freeOverCents: row.free_over_amount === null ? null : parseCents(row.free_over_amount),
    smallOrderUnderCents: row.small_order_under_amount === null ? null : parseCents(row.small_order_under_amount),
    smallOrderFeeCents: row.small_order_fee_amount === null ? 0 : parseCents(row.small_order_fee_amount),
    todayPremiumCents: parseCents(row.today_premium_amount),
    slotPremiumCents: new Map(premiums.rows.map((p) => [p.slot_id, parseCents(p.add_amount)])),
    stepCents: parseCents(row.rounding_step),
    floorCents: parseCents(row.floor_amount),
    capCents: parseCents(row.cap_amount),
  };
}
