// Repository for the delivery settings and collection runs (047; fee plans moved to pricing.repository.ts in 077). SQL only — no HTTP, no validation
// (Principle VI). ⚠ Every mutation writes an admin.audit_log row inside the SAME transaction as the
// change (009 pattern), so attribution can never be missing for the change that mattered.
import { query, withTransaction } from "@effy/edge-shared";

import type { Settings } from "./types";

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
