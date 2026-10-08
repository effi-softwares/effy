// Repository for delivery fee plans v2 (077). SQL only — no HTTP, no validation (Principle VI).
//
// ⚠ Two rules live in the DATABASE and are only asked for here: whether a plan is complete
// (`public.delivery_plan_gaps`) and the one way a plan goes live (`public.delivery_plan_activate`).
// A third is held HERE: an activated plan is never changed (`savePlan`) and never deleted (nothing
// here can). Every write records an audit row in the SAME transaction (009 pattern).
import { query, withTransaction, type Queryable } from "@effy/edge-shared";
import type { FeePlanInput, FeePlanKind, FeePlanDTO, PlanGapDTO, SlotPremiumDTO } from "@effy/shared-types";

/** A refusal the console tells apart — `code` becomes the problem's type. */
export class PricingError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409 | 422,
    public readonly code: string,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PricingError";
  }
}

interface PlanRow {
  id: string;
  kind: FeePlanKind;
  name: string;
  is_active: boolean;
  activated_at: Date | null;
  activated_by: string | null;
  created_by: string;
  created_at: Date;
  base_amount: string;
  free_over_amount: string | null;
  small_order_under_amount: string | null;
  small_order_fee_amount: string | null;
  today_premium_amount: string;
  rounding_step: string;
  floor_amount: string;
  cap_amount: string;
}

const COLS = `id::text AS id, kind, name, is_active, activated_at, activated_by, created_by, created_at,
              base_amount::text AS base_amount, free_over_amount::text AS free_over_amount,
              small_order_under_amount::text AS small_order_under_amount,
              small_order_fee_amount::text AS small_order_fee_amount,
              today_premium_amount::text AS today_premium_amount,
              rounding_step::text AS rounding_step, floor_amount::text AS floor_amount, cap_amount::text AS cap_amount`;

async function hydrate(q: Queryable, r: PlanRow): Promise<FeePlanDTO> {
  const [distance, weight, premiums, gaps] = await Promise.all([
    q.query<{ upper_km: string | null; add_amount: string }>(
      `SELECT upper_km::text AS upper_km, add_amount::text AS add_amount FROM public.delivery_distance_band
        WHERE plan_id = $1 ORDER BY upper_km NULLS LAST`,
      [r.id],
    ),
    q.query<{ upper_grams: number; add_amount: string }>(
      `SELECT upper_grams, add_amount::text AS add_amount FROM public.delivery_weight_band WHERE plan_id = $1 ORDER BY upper_grams`,
      [r.id],
    ),
    q.query<{ slot_id: string; label: string; active: boolean; add_amount: string }>(
      `SELECT p.slot_id::text AS slot_id,
              to_char(s.start_time, 'HH24:MI') || '–' || to_char(s.end_time, 'HH24:MI') AS label,
              -- availability-exempt: public.delivery_slot — a delivery window's lifecycle, not a product's.
              s.status = 'active' AS active, p.add_amount::text AS add_amount
         FROM public.delivery_slot_premium p JOIN public.delivery_slot s ON s.id = p.slot_id
        WHERE p.plan_id = $1 ORDER BY s.start_time`,
      [r.id],
    ),
    q.query<{ code: PlanGapDTO["code"]; blocking: boolean; detail: PlanGapDTO["detail"] }>(
      `SELECT code, blocking, detail FROM public.delivery_plan_gaps($1)`,
      [r.id],
    ),
  ]);
  const slotPremiums: SlotPremiumDTO[] = premiums.rows.map((p) => ({
    slotId: p.slot_id, label: p.label, slotActive: p.active, addAmount: p.add_amount,
  }));
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    state: r.is_active ? "active" : r.activated_at ? "retired" : "draft",
    baseAmount: r.base_amount,
    distanceBands: distance.rows.map((b) => ({ upperKm: b.upper_km, addAmount: b.add_amount })),
    weightBands: weight.rows.map((b) => ({ upperGrams: b.upper_grams, addAmount: b.add_amount })),
    freeOverAmount: r.free_over_amount,
    smallOrderUnderAmount: r.small_order_under_amount,
    smallOrderFeeAmount: r.small_order_fee_amount,
    todayPremiumAmount: r.today_premium_amount,
    slotPremiums,
    roundingStepAmount: r.rounding_step,
    floorAmount: r.floor_amount,
    capAmount: r.cap_amount,
    gaps: gaps.rows.map((g) => ({ code: g.code, blocking: g.blocking, detail: g.detail })),
    createdBy: r.created_by,
    createdAt: r.created_at.toISOString(),
    activatedBy: r.activated_by,
    activatedAt: r.activated_at ? r.activated_at.toISOString() : null,
  };
}

/** Every plan of a kind: the active one first, then drafts, then retired — newest first within each. */
export async function listPlans(kind: FeePlanKind): Promise<FeePlanDTO[]> {
  const res = await query<PlanRow>(
    `SELECT ${COLS} FROM public.delivery_fee_plan WHERE kind = $1
      ORDER BY is_active DESC, (activated_at IS NULL) DESC, COALESCE(activated_at, created_at) DESC`,
    [kind],
  );
  return Promise.all(res.rows.map((r) => hydrate({ query } as Queryable, r)));
}

export async function readPlan(id: string): Promise<FeePlanDTO | null> {
  const r = (await query<PlanRow>(`SELECT ${COLS} FROM public.delivery_fee_plan WHERE id = $1`, [id])).rows[0];
  return r ? hydrate({ query } as Queryable, r) : null;
}

/** The ids of every delivery window that exists, switched on or off. */
export async function slotIds(): Promise<Set<string>> {
  return new Set((await query<{ id: string }>(`SELECT id::text AS id FROM public.delivery_slot`)).rows.map((r) => r.id));
}

export async function activePlanId(kind: FeePlanKind): Promise<string | null> {
  return (await query<{ id: string }>(`SELECT id::text AS id FROM public.delivery_fee_plan WHERE is_active AND kind = $1`, [kind])).rows[0]?.id ?? null;
}

/**
 * Create a draft (`id` null) or replace one whole. ⚠ Replacing a plan that has ever been active is
 * refused HERE, under the plan's row lock — this is the one place FR-016 is held (a database trigger
 * was tried and withdrawn: triggers may only mark analytics buckets, 058 R6). There is no function
 * that deletes a plan, by design.
 */
export async function savePlan(id: string | null, input: FeePlanInput, actorSub: string): Promise<string> {
  try {
    return await withTransaction(async (tx) => {
      let before: FeePlanDTO | null = null;
      let planId = id;
      const values = [
        input.name, input.baseAmount, input.freeOverAmount, input.smallOrderUnderAmount, input.smallOrderFeeAmount,
        input.todayPremiumAmount, input.roundingStepAmount, input.floorAmount, input.capAmount, actorSub,
      ];
      if (planId === null) {
        planId = (
          await tx.query<{ id: string }>(
            `INSERT INTO public.delivery_fee_plan
               (name, base_amount, free_over_amount, small_order_under_amount, small_order_fee_amount, today_premium_amount,
                rounding_step, floor_amount, cap_amount, created_by, updated_by, kind)
             VALUES ($1, $2::numeric, $3::numeric, $4::numeric, $5::numeric, $6::numeric, $7::numeric, $8::numeric, $9::numeric, $10, $10, $11)
             RETURNING id::text AS id`,
            [...values, input.kind],
          )
        ).rows[0]!.id;
      } else {
        const row = (await tx.query<PlanRow>(`SELECT ${COLS} FROM public.delivery_fee_plan WHERE id = $1 FOR UPDATE`, [planId])).rows[0];
        if (!row) throw new PricingError(404, "plan_not_found", "that fee plan does not exist");
        if (row.activated_at) throw new PricingError(409, "plan_not_draft", "a plan that has been active cannot be changed — copy it to a new draft");
        if (row.kind !== input.kind) throw new PricingError(422, "plan_kind_mismatch", "a plan cannot change kind");
        before = await hydrate(tx, row);
        await tx.query(
          `UPDATE public.delivery_fee_plan
              SET name = $1, base_amount = $2::numeric, free_over_amount = $3::numeric, small_order_under_amount = $4::numeric,
                  small_order_fee_amount = $5::numeric, today_premium_amount = $6::numeric, rounding_step = $7::numeric,
                  floor_amount = $8::numeric, cap_amount = $9::numeric, updated_by = $10, updated_at = now()
            WHERE id = $11`,
          [...values, planId],
        );
        await tx.query(`DELETE FROM public.delivery_distance_band WHERE plan_id = $1`, [planId]);
        await tx.query(`DELETE FROM public.delivery_weight_band WHERE plan_id = $1`, [planId]);
        await tx.query(`DELETE FROM public.delivery_slot_premium WHERE plan_id = $1`, [planId]);
      }
      for (const b of input.distanceBands) {
        await tx.query(`INSERT INTO public.delivery_distance_band (plan_id, upper_km, add_amount) VALUES ($1, $2::numeric, $3::numeric)`, [planId, b.upperKm, b.addAmount]);
      }
      for (const b of input.weightBands) {
        await tx.query(`INSERT INTO public.delivery_weight_band (plan_id, upper_grams, add_amount) VALUES ($1, $2, $3::numeric)`, [planId, b.upperGrams, b.addAmount]);
      }
      for (const p of input.slotPremiums) {
        await tx.query(`INSERT INTO public.delivery_slot_premium (plan_id, slot_id, add_amount) VALUES ($1, $2, $3::numeric)`, [planId, p.slotId, p.addAmount]);
      }
      await tx.query(
        `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail) VALUES ($1, $2, 'pricing', $3, $4::jsonb)`,
        [actorSub, before ? "pricing.plan.update" : "pricing.plan.create", planId, JSON.stringify({ before: before && strip(before), after: input })],
      );
      return planId;
    });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw new PricingError(409, "duplicate_name", "another fee plan already has that name");
    throw err;
  }
}

/** What a plan WAS, for the audit row — its values, not its derived state. */
function strip(p: FeePlanDTO): Omit<FeePlanDTO, "gaps" | "state" | "createdBy" | "createdAt" | "activatedBy" | "activatedAt"> {
  const { gaps: _g, state: _s, createdBy: _c, createdAt: _ca, activatedBy: _a, activatedAt: _aa, ...rest } = p;
  return rest;
}

const ACTIVATION_REFUSALS: Record<string, [409 | 404, string]> = {
  plan_not_found: [404, "that fee plan does not exist"],
  plan_already_active: [409, "that plan is already the one in force"],
  plan_retired: [409, "a plan that has been replaced is not brought back — copy it to a new draft"],
  plan_incomplete: [409, "this plan cannot price every delivery yet"],
  zero_floor_unconfirmed: [409, "the minimum fee is $0 — confirm that delivery may be free without the free-delivery amount"],
};

/** Make a plan the one in force, through the one function that may. Returns the plan it retired. */
export async function activatePlan(id: string, actorSub: string, confirmZeroFloor: boolean): Promise<string | null> {
  try {
    return await withTransaction(async (tx) => {
      const out = (
        await tx.query<{ retired_id: string | null }>(
          `SELECT retired_id::text AS retired_id FROM public.delivery_plan_activate($1, $2, $3)`,
          [id, actorSub, confirmZeroFloor],
        )
      ).rows[0]!;
      await tx.query(
        `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
         VALUES ($1, 'pricing.plan.activate', 'pricing', $2, $3::jsonb)`,
        [actorSub, id, JSON.stringify({ retired: out.retired_id, confirmZeroFloor })],
      );
      return out.retired_id;
    });
  } catch (err) {
    const e = err as { message?: string; detail?: string };
    const refusal = e.message ? ACTIVATION_REFUSALS[e.message] : undefined;
    if (!refusal) throw err;
    const extra = e.message === "plan_incomplete" && e.detail ? { gaps: JSON.parse(e.detail) as PlanGapDTO[] } : undefined;
    throw new PricingError(refusal[0], e.message!, refusal[1], extra);
  }
}
