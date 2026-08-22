// Repository for hub check-in (049 US1) — the pivot. Raw SQL, no ORM. Ends a collection run and
// reports the same-day/standard split (the method is already known from checkout — 047
// order_package_delivery.method — so nothing is sorted). Standard packages simply do not become
// delivery drops; they stay `collected` and are handed to the external carrier at the dock.

import { query, withTransaction } from "@effy/edge-shared";
import type pg from "pg";

import type { HubCheckinResponse } from "@effy/shared-types";

/**
 * End the collection run (`checked_in`) and return the split. Requires the run to belong to the driver
 * and every collection task to be terminal (collected/short). Idempotent by changeId.
 * Returns null if the run isn't the driver's; throws {code:"incomplete"} if packages are still open.
 */
export async function checkIn(
  runId: string,
  driverId: string,
  changeId: string,
): Promise<HubCheckinResponse | null> {
  return withTransaction(async (tx: pg.PoolClient) => {
    const run = await tx.query<{ status: string }>(
      `SELECT status FROM public.driver_run
        WHERE id = $1 AND driver_id = $2 AND type = 'collection' FOR UPDATE`,
      [runId, driverId],
    );
    if (run.rowCount === 0) return null;

    // Every task must be terminal before check-in ends the run.
    const open = await tx.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.collection_task
        WHERE run_id = $1 AND status IN ('assigned', 'en_route')`,
      [runId],
    );
    if (Number(open.rows[0]?.n ?? "0") > 0) {
      const err = new Error("collection run still has uncollected packages");
      (err as { code?: string }).code = "incomplete";
      throw err;
    }

    // The split: join each task's package to its delivery method (already set at checkout).
    const split = await tx.query<{ same_day: string; standard: string; total: string }>(
      `SELECT count(*) FILTER (WHERE opd.method = 'same_day')::text  AS same_day,
              count(*) FILTER (WHERE opd.method = 'standard' OR opd.method IS NULL)::text AS standard,
              count(*)::text AS total
         FROM public.collection_task ct
         JOIN public.shop_fulfillment sf ON sf.id = ct.shop_fulfillment_id
         LEFT JOIN public.order_package_delivery opd
                ON opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id
        WHERE ct.run_id = $1 AND ct.status IN ('collected', 'short')`,
      [runId],
    );
    const row = split.rows[0]!;

    // End the run once (idempotent): only flip if not already checked_in.
    if (run.rows[0]!.status !== "checked_in") {
      await tx.query(
        `UPDATE public.driver_run SET status = 'checked_in', completed_at = now() WHERE id = $1`,
        [runId],
      );
      await tx.query(
        `INSERT INTO public.driver_task_event (run_id, status, change_id) VALUES ($1, 'checked_in', $2)
         ON CONFLICT (change_id) DO NOTHING`,
        [runId, changeId],
      );
    }

    return {
      scannedTotal: Number(row.total),
      sameDayCount: Number(row.same_day),
      standardCount: Number(row.standard),
    };
  });
}
