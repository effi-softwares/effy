// Repository for the delivery fee-plan + ring config (047). SQL only — no HTTP, no validation
// (Principle VI). ⚠ Every mutation writes an admin.audit_log row inside the SAME transaction as the
// change (009 pattern), so attribution can never be missing for the change that mattered.
import { query, withTransaction } from "@effy/edge-shared";

import type { FeePlan, NewFeePlan, Ring, Settings } from "./types";

interface RingRow {
  id: string;
  code: string;
  name: string;
  ordinal: number;
  suggest_upper_km: string | null;
  status: string;
}

function toRing(r: RingRow): Ring {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    ordinal: r.ordinal,
    suggestUpperKm: r.suggest_upper_km,
    status: r.status as Ring["status"],
  };
}

export async function listRings(): Promise<Ring[]> {
  const res = await query<RingRow>(
    `SELECT id::text, code, name, ordinal, suggest_upper_km::text, status
       FROM public.delivery_ring ORDER BY ordinal`,
  );
  return res.rows.map(toRing);
}

interface PlanRow {
  id: string;
  name: string;
  is_active: boolean;
  rounding_step: string;
  floor_amount: string;
  cap_amount: string;
  same_day_factor: string;
  standard_factor: string;
  activated_by: string | null;
  activated_at: Date | null;
}

async function planChildren(planId: string): Promise<Pick<FeePlan, "ringPrices" | "weightBands">> {
  const prices = await query<{ ring_id: string; price_amount: string }>(
    `SELECT ring_id::text, price_amount::text FROM public.delivery_ring_price WHERE plan_id = $1`,
    [planId],
  );
  const bands = await query<{ upper_grams: number; add_amount: string }>(
    `SELECT upper_grams, add_amount::text FROM public.delivery_weight_band WHERE plan_id = $1 ORDER BY upper_grams`,
    [planId],
  );
  return {
    ringPrices: prices.rows.map((r) => ({ ringId: r.ring_id, priceAmount: r.price_amount })),
    weightBands: bands.rows.map((b) => ({ upperGrams: b.upper_grams, addAmount: b.add_amount })),
  };
}

function toPlanHeader(r: PlanRow): Omit<FeePlan, "ringPrices" | "weightBands"> {
  return {
    id: r.id,
    name: r.name,
    isActive: r.is_active,
    roundingStep: r.rounding_step,
    floorAmount: r.floor_amount,
    capAmount: r.cap_amount,
    sameDayFactor: r.same_day_factor,
    standardFactor: r.standard_factor,
    activatedBy: r.activated_by,
    activatedAt: r.activated_at ? r.activated_at.toISOString() : null,
  };
}

const planCols = `id::text, name, is_active, rounding_step::text, floor_amount::text, cap_amount::text,
                  same_day_factor::text, standard_factor::text, activated_by, activated_at`;

export async function listPlans(): Promise<FeePlan[]> {
  const res = await query<PlanRow>(`SELECT ${planCols} FROM public.delivery_fee_plan ORDER BY name`);
  const out: FeePlan[] = [];
  for (const row of res.rows) {
    out.push({ ...toPlanHeader(row), ...(await planChildren(row.id)) });
  }
  return out;
}

export async function readPlan(planId: string): Promise<FeePlan | null> {
  const res = await query<PlanRow>(`SELECT ${planCols} FROM public.delivery_fee_plan WHERE id = $1`, [planId]);
  if (res.rows.length === 0) return null;
  return { ...toPlanHeader(res.rows[0]!), ...(await planChildren(planId)) };
}

export async function createPlan(input: NewFeePlan, actorSub: string): Promise<FeePlan> {
  const id = await withTransaction(async (client) => {
    const ins = await client.query<{ id: string }>(
      `INSERT INTO public.delivery_fee_plan
         (name, rounding_step, floor_amount, cap_amount, same_day_factor, standard_factor, created_by)
       VALUES ($1, $2::numeric, $3::numeric, $4::numeric, $5::numeric, $6::numeric, $7)
       RETURNING id::text`,
      [input.name, input.roundingStep, input.floorAmount, input.capAmount,
        input.sameDayFactor, input.standardFactor, actorSub],
    );
    const planId = ins.rows[0]!.id;
    for (const rp of input.ringPrices) {
      await client.query(
        `INSERT INTO public.delivery_ring_price (plan_id, ring_id, price_amount) VALUES ($1, $2, $3::numeric)`,
        [planId, rp.ringId, rp.priceAmount],
      );
    }
    for (const wb of input.weightBands) {
      await client.query(
        `INSERT INTO public.delivery_weight_band (plan_id, upper_grams, add_amount) VALUES ($1, $2, $3::numeric)`,
        [planId, wb.upperGrams, wb.addAmount],
      );
    }
    await client.query(
      `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
       VALUES ($1, 'delivery_fee_plan.create', 'delivery_fee_plan', $2, $3::jsonb)`,
      [actorSub, planId, JSON.stringify({ name: input.name })],
    );
    return planId;
  });
  return (await readPlan(id))!;
}

// ── Activation-gate reads (FR-051) ────────────────────────────────────────────────────────────────

export async function activeRings(): Promise<{ id: string; code: string }[]> {
  const res = await query<{ id: string; code: string }>(
    `SELECT id::text, code FROM public.delivery_ring WHERE status = 'active' ORDER BY ordinal`,
  );
  return res.rows;
}

export async function planPricedRingIds(planId: string): Promise<Set<string>> {
  const res = await query<{ ring_id: string }>(
    `SELECT ring_id::text FROM public.delivery_ring_price WHERE plan_id = $1`,
    [planId],
  );
  return new Set(res.rows.map((r) => r.ring_id));
}

export async function planWeightBandCount(planId: string): Promise<number> {
  const res = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM public.delivery_weight_band WHERE plan_id = $1`,
    [planId],
  );
  return Number(res.rows[0]?.n ?? "0");
}

export async function planExists(planId: string): Promise<boolean> {
  const res = await query<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM public.delivery_fee_plan WHERE id = $1) AS ok`,
    [planId],
  );
  return res.rows[0]?.ok ?? false;
}

// activatePlan flips exactly one plan active, in one tx (the partial-unique index is the second guard).
export async function activatePlan(planId: string, actorSub: string): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(`UPDATE public.delivery_fee_plan SET is_active = false WHERE is_active = true`);
    await client.query(
      `UPDATE public.delivery_fee_plan SET is_active = true, activated_by = $2, activated_at = now() WHERE id = $1`,
      [planId, actorSub],
    );
    await client.query(
      `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
       VALUES ($1, 'delivery_fee_plan.activate', 'delivery_fee_plan', $2, '{}'::jsonb)`,
      [actorSub, planId],
    );
  });
}

export async function readSettings(): Promise<Settings | null> {
  const res = await query<{ hub_latitude: string; hub_longitude: string; sameday_prep_buffer_min: number }>(
    `SELECT hub_latitude::text, hub_longitude::text, sameday_prep_buffer_min FROM public.delivery_settings WHERE id = 1`,
  );
  const r = res.rows[0];
  if (!r) return null;
  return { hubLatitude: r.hub_latitude, hubLongitude: r.hub_longitude, samedayPrepBufferMin: r.sameday_prep_buffer_min };
}

/**
 * Saves the settings and, when the HUB MOVED, recalculates the coverage list's distances in the same
 * transaction (076 FR-012).
 *
 * ⚠ ONE TRANSACTION, deliberately. Distance is measured from the hub; a saved hub with yesterday's
 * distances is a list that is wrong until some later job runs — and the next feature prices
 * delivery on these numbers.
 *
 * ⚠ ONLY worked-out distances move. A hand-entered one is a person's statement, not a calculation;
 * it is left exactly as it was and flagged for that person to look at again. A worked-out distance
 * whose place has since lost its location is kept too — it is never blanked.
 */
export async function upsertSettings(input: Settings, actorSub: string): Promise<Settings> {
  const distances = await withTransaction(async (client) => {
    const before = (
      await client.query<{ hub_latitude: string; hub_longitude: string }>(
        `SELECT hub_latitude::text, hub_longitude::text FROM public.delivery_settings WHERE id = 1 FOR UPDATE`,
      )
    ).rows[0];
    await client.query(
      `INSERT INTO public.delivery_settings (id, hub_latitude, hub_longitude, sameday_prep_buffer_min, updated_by)
       VALUES (1, $1::numeric, $2::numeric, $3, $4)
       ON CONFLICT (id) DO UPDATE
         SET hub_latitude = EXCLUDED.hub_latitude, hub_longitude = EXCLUDED.hub_longitude,
             sameday_prep_buffer_min = EXCLUDED.sameday_prep_buffer_min,
             updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [input.hubLatitude, input.hubLongitude, input.samedayPrepBufferMin, actorSub],
    );
    await client.query(
      `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
       VALUES ($1, 'delivery_settings.update', 'delivery_settings', NULL, $2::jsonb)`,
      [actorSub, JSON.stringify({ hubLatitude: input.hubLatitude, hubLongitude: input.hubLongitude, samedayPrepBufferMin: input.samedayPrepBufferMin })],
    );

    const after = (
      await client.query<{ hub_latitude: string; hub_longitude: string }>(
        `SELECT hub_latitude::text, hub_longitude::text FROM public.delivery_settings WHERE id = 1`,
      )
    ).rows[0]!;
    // Compared as the database stores them, so "-37.8136" and "-37.813600" are the same hub.
    const moved = !before || before.hub_latitude !== after.hub_latitude || before.hub_longitude !== after.hub_longitude;
    if (!moved) return undefined;

    const computed = (await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM public.delivery_zone_postcode WHERE distance_source = 'computed'`)).rows[0]!;
    const recomputed = await client.query(
      `UPDATE public.delivery_zone_postcode zp
          SET distance_km = d.km, updated_at = now()
         FROM (SELECT postcode, public.coverage_computed_distance_km(postcode) AS km
                 FROM public.delivery_zone_postcode WHERE distance_source = 'computed') d
        WHERE d.postcode = zp.postcode AND d.km IS NOT NULL AND d.km IS DISTINCT FROM zp.distance_km`,
    );
    const flagged = await client.query(
      `UPDATE public.delivery_zone_postcode SET distance_review = true, updated_at = now() WHERE distance_source = 'manual'`,
    );
    const result = {
      recomputed: recomputed.rowCount ?? 0,
      unchanged: Number(computed.n) - (recomputed.rowCount ?? 0),
      manualFlagged: flagged.rowCount ?? 0,
    };
    await client.query(
      `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
       VALUES ($1, 'coverage.hub_recompute', 'coverage', NULL, $2::jsonb)`,
      [actorSub, JSON.stringify({ before: before ?? null, after, ...result })],
    );
    return result;
  });
  const saved = (await readSettings())!;
  return distances ? { ...saved, distances } : saved;
}

// ── Collection runs (047 US2) ────────────────────────────────────────────

interface RunRow { id: string; run_time: string; label: string | null; status: string }

export async function listCollectionRuns(): Promise<{ id: string; runTime: string; label: string | null; status: string }[]> {
  const res = await query<RunRow>(
    `SELECT id::text, to_char(run_time, 'HH24:MI') AS run_time, label, status
       FROM public.delivery_collection_run ORDER BY run_time`,
  );
  return res.rows.map((r) => ({ id: r.id, runTime: r.run_time, label: r.label, status: r.status }));
}

export async function createCollectionRun(runTime: string, label: string | null, actorSub: string): Promise<void> {
  await withTransaction(async (client) => {
    const ins = await client.query<{ id: string }>(
      `INSERT INTO public.delivery_collection_run (run_time, label, updated_by) VALUES ($1::time, $2, $3) RETURNING id::text`,
      [runTime, label, actorSub],
    );
    await client.query(
      `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
       VALUES ($1, 'delivery_collection_run.create', 'delivery_collection_run', $2, $3::jsonb)`,
      [actorSub, ins.rows[0]!.id, JSON.stringify({ runTime, label })],
    );
  });
}

export async function deleteCollectionRun(id: string, actorSub: string): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM public.delivery_collection_run WHERE id = $1`, [id]);
    await client.query(
      `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
       VALUES ($1, 'delivery_collection_run.delete', 'delivery_collection_run', $2, '{}'::jsonb)`,
      [actorSub, id],
    );
  });
}
