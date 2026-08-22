// Repository for the auto-assignment sweep (049). Raw SQL, no ORM.
//
// Idempotency + the no-double-assign guarantee come from the schema (UNIQUE(shop_fulfillment_id) on
// collection_task and delivery_task_package) plus FOR UPDATE SKIP LOCKED on candidate selection
// (research R2/R10). This module holds the queries the worker composes; per-type ASSIGNMENT of
// ready collection work (T017/US1) and checked-in same-day drops (T025/US2) is added in those slices.

import { query } from "@effy/edge-shared";

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
