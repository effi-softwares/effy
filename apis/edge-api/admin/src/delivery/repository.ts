// Repository for the delivery fee-plan + ring config (047). SQL only — no HTTP, no validation
// (Principle VI). ⚠ Every mutation writes an admin.audit_log row inside the SAME transaction as the
// change (009 pattern), so attribution can never be missing for the change that mattered.
import { query, withTransaction } from "@effy/edge-shared";

import type {
  FeePlan, NewFeePlan, NewRing, NewZone, PlaceRef, Ring, Settings, Zone, ZonePatch,
} from "./types";

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

export async function createRing(input: NewRing, actorSub: string): Promise<Ring> {
  return withTransaction(async (client) => {
    const ins = await client.query<RingRow>(
      `INSERT INTO public.delivery_ring (code, name, ordinal, suggest_upper_km, updated_by)
       VALUES ($1, $2, $3, NULLIF($4, '')::numeric, $5)
       RETURNING id::text, code, name, ordinal, suggest_upper_km::text, status`,
      [input.code, input.name, input.ordinal, input.suggestUpperKm ?? "", actorSub],
    );
    const ring = toRing(ins.rows[0]!);
    await client.query(
      `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
       VALUES ($1, 'delivery_ring.create', 'delivery_ring', $2, $3::jsonb)`,
      [actorSub, ring.id, JSON.stringify(input)],
    );
    return ring;
  });
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

// ── Zones & serviceability (047) ──────────────────────────────────────────────────────────────────

interface ZoneRow {
  id: string;
  code: string;
  name: string;
  ring_id: string;
  ring_is_overridden: boolean;
  suggested_ring_id: string | null;
  hub_distance_km: string | null;
  sameday_eligible: boolean;
  status: string;
  postcode_count: string;
}

function toZone(r: ZoneRow): Zone {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    ringId: r.ring_id,
    ringIsOverridden: r.ring_is_overridden,
    suggestedRingId: r.suggested_ring_id,
    hubDistanceKm: r.hub_distance_km,
    samedayEligible: r.sameday_eligible,
    status: r.status as Zone["status"],
    postcodeCount: Number(r.postcode_count),
  };
}

const zoneCols = `z.id::text, z.code, z.name, z.ring_id::text, z.ring_is_overridden,
  z.suggested_ring_id::text, z.hub_distance_km::text, z.sameday_eligible, z.status,
  (SELECT count(*) FROM public.delivery_zone_postcode zp WHERE zp.zone_id = z.id)::text AS postcode_count`;

export async function listZones(): Promise<Zone[]> {
  const res = await query<ZoneRow>(`SELECT ${zoneCols} FROM public.delivery_zone z ORDER BY z.code`);
  return res.rows.map(toZone);
}

export async function readZone(zoneId: string): Promise<Zone | null> {
  const res = await query<ZoneRow>(`SELECT ${zoneCols} FROM public.delivery_zone z WHERE z.id = $1`, [zoneId]);
  return res.rows[0] ? toZone(res.rows[0]) : null;
}

export async function zoneExists(zoneId: string): Promise<boolean> {
  const res = await query<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM public.delivery_zone WHERE id = $1) AS ok`, [zoneId]);
  return res.rows[0]?.ok ?? false;
}

export async function createZone(input: NewZone, actorSub: string): Promise<Zone> {
  const id = await withTransaction(async (client) => {
    const ins = await client.query<{ id: string }>(
      `INSERT INTO public.delivery_zone (code, name, ring_id, updated_by)
       VALUES ($1, $2, $3, $4) RETURNING id::text`,
      [input.code, input.name, input.ringId, actorSub],
    );
    const zoneId = ins.rows[0]!.id;
    await client.query(
      `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
       VALUES ($1, 'delivery_zone.create', 'delivery_zone', $2, $3::jsonb)`,
      [actorSub, zoneId, JSON.stringify(input)],
    );
    return zoneId;
  });
  return (await readZone(id))!;
}

export async function updateZone(zoneId: string, patch: ZonePatch, actorSub: string): Promise<Zone> {
  await withTransaction(async (client) => {
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (patch.name !== undefined) { sets.push(`name = $${i++}`); params.push(patch.name); }
    if (patch.ringId !== undefined) {
      // An explicit ring choice is an override of any suggestion (FR-016).
      sets.push(`ring_id = $${i++}`, `ring_is_overridden = true`);
      params.push(patch.ringId);
    }
    if (patch.samedayEligible !== undefined) { sets.push(`sameday_eligible = $${i++}`); params.push(patch.samedayEligible); }
    if (patch.status !== undefined) { sets.push(`status = $${i++}`); params.push(patch.status); }
    sets.push(`updated_by = $${i++}`); params.push(actorSub);
    params.push(zoneId);
    await client.query(
      `UPDATE public.delivery_zone SET ${sets.join(", ")}, updated_at = now() WHERE id = $${i}`, params);
    await client.query(
      `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
       VALUES ($1, 'delivery_zone.update', 'delivery_zone', $2, $3::jsonb)`,
      [actorSub, zoneId, JSON.stringify(patch)],
    );
  });
  return (await readZone(zoneId))!;
}

export async function placesForPostcode(postcode: string): Promise<PlaceRef[]> {
  const res = await query<PlaceRef>(
    `SELECT name, state, postcode FROM public.locality WHERE postcode = $1 ORDER BY address_count DESC, name`,
    [postcode],
  );
  return res.rows;
}

export async function postcodeZoneCode(postcode: string): Promise<string | null> {
  const res = await query<{ code: string }>(
    `SELECT z.code FROM public.delivery_zone_postcode zp
       JOIN public.delivery_zone z ON z.id = zp.zone_id WHERE zp.postcode = $1`,
    [postcode],
  );
  return res.rows[0]?.code ?? null;
}

export async function addZonePostcode(zoneId: string, postcode: string, actorSub: string): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO public.delivery_zone_postcode (zone_id, postcode) VALUES ($1, $2)`, [zoneId, postcode]);
    await client.query(
      `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
       VALUES ($1, 'delivery_zone.add_postcode', 'delivery_zone', $2, $3::jsonb)`,
      [actorSub, zoneId, JSON.stringify({ postcode })],
    );
  });
}

export async function removeZonePostcode(zoneId: string, postcode: string, actorSub: string): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `DELETE FROM public.delivery_zone_postcode WHERE zone_id = $1 AND postcode = $2`, [zoneId, postcode]);
    await client.query(
      `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
       VALUES ($1, 'delivery_zone.remove_postcode', 'delivery_zone', $2, $3::jsonb)`,
      [actorSub, zoneId, JSON.stringify({ postcode })],
    );
  });
}

// zoneRepresentativePoint is the mean coordinate of the zone's postcodes' localities (skipping those
// with no G-NAF point). n=0 means the zone has no coordinate — no suggestion can be made (FR-015 edge).
export async function zoneRepresentativePoint(zoneId: string): Promise<{ lat: number; lng: number; n: number }> {
  const res = await query<{ lat: string | null; lng: string | null; n: string }>(
    `SELECT avg(l.latitude)::text AS lat, avg(l.longitude)::text AS lng, count(l.latitude)::text AS n
       FROM public.delivery_zone_postcode zp
       JOIN public.locality l ON l.postcode = zp.postcode
      WHERE zp.zone_id = $1 AND l.latitude IS NOT NULL AND l.longitude IS NOT NULL`,
    [zoneId],
  );
  const row = res.rows[0];
  const n = Number(row?.n ?? "0");
  return { lat: Number(row?.lat ?? "0"), lng: Number(row?.lng ?? "0"), n };
}

export async function ringsForSuggestion(): Promise<{ id: string; suggestUpperKm: number | null }[]> {
  const res = await query<{ id: string; upper: number | null }>(
    `SELECT id::text, suggest_upper_km::float8 AS upper FROM public.delivery_ring WHERE status = 'active' ORDER BY ordinal`,
  );
  return res.rows.map((r) => ({ id: r.id, suggestUpperKm: r.upper }));
}

export async function persistZoneSuggestion(
  zoneId: string, suggestedRingId: string | null, hubDistanceKm: number | null,
): Promise<void> {
  await query(
    `UPDATE public.delivery_zone
        SET suggested_ring_id = $2, hub_distance_km = $3::numeric, updated_at = now()
      WHERE id = $1`,
    [zoneId, suggestedRingId, hubDistanceKm],
  );
}

export async function readSettings(): Promise<Settings | null> {
  const res = await query<{ hub_latitude: string; hub_longitude: string; sameday_prep_buffer_min: number }>(
    `SELECT hub_latitude::text, hub_longitude::text, sameday_prep_buffer_min FROM public.delivery_settings WHERE id = 1`,
  );
  const r = res.rows[0];
  if (!r) return null;
  return { hubLatitude: r.hub_latitude, hubLongitude: r.hub_longitude, samedayPrepBufferMin: r.sameday_prep_buffer_min };
}

export async function upsertSettings(input: Settings, actorSub: string): Promise<Settings> {
  await withTransaction(async (client) => {
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
      [actorSub, JSON.stringify(input)],
    );
  });
  return (await readSettings())!;
}

// ── Collection runs & same-day exceptions (047 US2/US3) ────────────────────────────────────────────

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

export async function listExceptions(zoneId: string): Promise<{ id: string; shopId: string; zoneId: string; mode: string }[]> {
  const res = await query<{ id: string; shop_id: string; zone_id: string; mode: string }>(
    `SELECT id::text, shop_id::text, zone_id::text, mode FROM public.shop_sameday_exception WHERE zone_id = $1`,
    [zoneId],
  );
  return res.rows.map((r) => ({ id: r.id, shopId: r.shop_id, zoneId: r.zone_id, mode: r.mode }));
}

export async function upsertException(shopId: string, zoneId: string, mode: string, actorSub: string): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO public.shop_sameday_exception (shop_id, zone_id, mode, updated_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (shop_id, zone_id) DO UPDATE SET mode = EXCLUDED.mode, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [shopId, zoneId, mode, actorSub],
    );
    await client.query(
      `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
       VALUES ($1, 'delivery_sameday_exception.upsert', 'delivery_zone', $2, $3::jsonb)`,
      [actorSub, zoneId, JSON.stringify({ shopId, mode })],
    );
  });
}

export async function deleteException(shopId: string, zoneId: string, actorSub: string): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM public.shop_sameday_exception WHERE shop_id = $1 AND zone_id = $2`, [shopId, zoneId]);
    await client.query(
      `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
       VALUES ($1, 'delivery_sameday_exception.delete', 'delivery_zone', $2, $3::jsonb)`,
      [actorSub, zoneId, JSON.stringify({ shopId })],
    );
  });
}
