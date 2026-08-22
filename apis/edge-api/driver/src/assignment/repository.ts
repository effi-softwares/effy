// Repository for the auto-assignment sweep (049). Raw SQL, no ORM.
//
// Idempotency + the no-double-assign guarantee come from the schema (UNIQUE(shop_fulfillment_id) on
// collection_task and delivery_task_package) plus FOR UPDATE SKIP LOCKED on candidate selection
// (research R2/R10). This module holds the queries the worker composes; per-type ASSIGNMENT of
// ready collection work (T017/US1) and checked-in same-day drops (T025/US2) is added in those slices.

import { query, withTransaction } from "@effy/edge-shared";
import type pg from "pg";

/** Drivers currently eligible for assignment: active record + an open duty session. */
export async function eligibleDriverIds(): Promise<string[]> {
  const result = await query<{ id: string }>(
    `SELECT d.id
       FROM public.driver d
       JOIN public.driver_duty_session s ON s.driver_id = d.id AND s.ended_at IS NULL
      WHERE d.status = 'active'`,
  );
  return result.rows.map((r) => r.id);
}

/**
 * T017 (US1) — assign ready collection work to an eligible on-duty driver.
 *
 * A package is ready when its shop_fulfillment is `ready_for_pickup` and no open collection_task
 * already claims it (UNIQUE(shop_fulfillment_id) also makes a double-claim impossible). We pick ONE
 * eligible driver who has no active collection run and give them the whole current round (all ready
 * packages), ordered by shop so same-shop packages are adjacent stops. Idempotent: a second sweep with
 * no new ready packages does nothing. Returns the number of packages assigned.
 */
export async function assignCollectionWork(): Promise<number> {
  return withTransaction(async (tx: pg.PoolClient) => {
    // An eligible driver: active record, open duty session, and NO active collection run.
    const driver = await tx.query<{ id: string }>(
      `SELECT d.id
         FROM public.driver d
         JOIN public.driver_duty_session s ON s.driver_id = d.id AND s.ended_at IS NULL
        WHERE d.status = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM public.driver_run r
             WHERE r.driver_id = d.id AND r.type = 'collection'
               AND r.status IN ('assigned', 'active')
          )
        ORDER BY s.started_at ASC
        LIMIT 1
        FOR UPDATE OF d SKIP LOCKED`,
    );
    const driverId = driver.rows[0]?.id;
    if (!driverId) return 0;

    // Ready packages not yet in any collection task. SKIP LOCKED so two sweeps never claim the same one.
    const ready = await tx.query<{ id: string; shop_id: string }>(
      `SELECT sf.id, sf.shop_id
         FROM public.shop_fulfillment sf
        WHERE sf.status = 'ready_for_pickup'
          AND NOT EXISTS (SELECT 1 FROM public.collection_task ct WHERE ct.shop_fulfillment_id = sf.id)
        ORDER BY sf.shop_id, sf.created_at
        FOR UPDATE OF sf SKIP LOCKED`,
    );
    if (ready.rowCount === 0) return 0;

    const run = await tx.query<{ id: string }>(
      `INSERT INTO public.driver_run (driver_id, type, status, business_date)
       VALUES ($1, 'collection', 'assigned', (now() AT TIME ZONE 'Australia/Melbourne')::date)
       RETURNING id`,
      [driverId],
    );
    const runId = run.rows[0]!.id;

    let seq = 0;
    for (const pkg of ready.rows) {
      await tx.query(
        `INSERT INTO public.collection_task (run_id, shop_fulfillment_id, shop_id, sequence, status)
         VALUES ($1, $2, $3, $4, 'assigned')`,
        [runId, pkg.id, pkg.shop_id, seq++],
      );
    }
    await tx.query(
      `INSERT INTO public.driver_task_event (run_id, status) VALUES ($1, 'assigned')`,
      [runId],
    );
    await tx.query(
      `INSERT INTO public.driver_activity (driver_id, type, run_id, body)
       VALUES ($1, 'run_assigned', $2, $3)`,
      [driverId, runId, `Collection run assigned — ${ready.rowCount} package(s) to collect`],
    );
    return ready.rowCount ?? 0;
  });
}

/**
 * FR-011 / T060 — release the not-yet-collected work of INELIGIBLE drivers back to the pool.
 *
 * A driver is ineligible when they have no open duty session (went off duty) or their record is
 * disabled. We delete their open, not-yet-started tasks so the next sweep re-assigns the underlying
 * ready packages / checked-in drops to an eligible driver. In-progress steps are NEVER yanked:
 * collection tasks past `assigned`/`en_route` (i.e. `collected`/`short`) and delivery tasks past
 * `staged` are left untouched. Empty runs left behind are cancelled. Idempotent.
 *
 * Returns the number of tasks released (for the worker's structured log / metrics).
 */
export async function releaseIneligibleWork(): Promise<number> {
  // Collection tasks: only 'assigned'/'en_route' (not yet collected) of ineligible drivers.
  const releasedCollection = await query<{ id: string }>(
    `DELETE FROM public.collection_task ct
      USING public.driver_run r
      WHERE ct.run_id = r.id
        AND ct.status IN ('assigned', 'en_route')
        AND NOT EXISTS (
          SELECT 1 FROM public.driver d
           WHERE d.id = r.driver_id
             AND d.status = 'active'
             AND EXISTS (SELECT 1 FROM public.driver_duty_session s
                          WHERE s.driver_id = d.id AND s.ended_at IS NULL)
        )
      RETURNING ct.id`,
  );

  // Delivery tasks: only 'staged' (not yet started) of ineligible drivers. Its packages cascade via
  // delivery_task_package ON DELETE CASCADE, freeing them for re-grouping.
  const releasedDelivery = await query<{ id: string }>(
    `DELETE FROM public.delivery_task dt
      USING public.driver_run r
      WHERE dt.run_id = r.id
        AND dt.status = 'staged'
        AND NOT EXISTS (
          SELECT 1 FROM public.driver d
           WHERE d.id = r.driver_id
             AND d.status = 'active'
             AND EXISTS (SELECT 1 FROM public.driver_duty_session s
                          WHERE s.driver_id = d.id AND s.ended_at IS NULL)
        )
      RETURNING dt.id`,
  );

  // Cancel now-empty active runs so they don't linger on a returning driver's home.
  await query(
    `UPDATE public.driver_run r
        SET status = 'cancelled', completed_at = now()
      WHERE r.status IN ('assigned', 'active')
        AND NOT EXISTS (SELECT 1 FROM public.collection_task ct WHERE ct.run_id = r.id)
        AND NOT EXISTS (SELECT 1 FROM public.delivery_task dt WHERE dt.run_id = r.id)`,
  );

  return (releasedCollection.rowCount ?? 0) + (releasedDelivery.rowCount ?? 0);
}
