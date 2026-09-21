// Completing a stop, and checking in at the hub (063, US2).
//
// ⚠ EVERY WRITE HERE IS IDEMPOTENT ON `changeId`. A driver is on a phone in a loading bay; a request
// that arrives without its response reaching them is ordinary, and the retry must not apply twice
// (027's changeId-per-action rule). "Simplify the request shape" was never licence to drop that.

import { query, withTransaction } from "@effy/edge-shared";
import type { CollectRequest, HubCheckinResponse } from "@effy/shared-types";

import { NotFoundError } from "./service";

export class ConflictError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "ConflictError";
  }
}

/**
 * Collect a shop's packages (FR-026).
 *
 * ⚠ THE FULFILLMENT STATUS WRITE BELOW IS LOAD-BEARING, AND A CONTAINER TEST EXISTS BECAUSE OF IT.
 * The wave planner's gather query excludes a package by `shop_fulfillment.status <> 'ready_for_pickup'`
 * — the partial unique index only excludes rows still `assigned`. So if this stops advancing the
 * status, EVERY subsequent wave re-collects packages already sitting in a driver's van, and nothing
 * anywhere fails. `planner.container.test.ts` pins it directly.
 *
 * ⚠ A PACKAGE NOT TAKEN IS RECORDED, NEVER OMITTED. Quietly leaving it out would mark it collected
 * by silence, and a package nobody is looking for is exactly the failure 056 found written into two
 * tables with no reader.
 */
export async function collectStop(
  runId: string,
  stopId: string,
  driverId: string,
  body: CollectRequest,
): Promise<{ collected: number; notAvailable: number }> {
  return withTransaction(async (tx: any) => {
    const stop = await tx.query(
      `SELECT rs.id, rs.status
         FROM public.round_stop rs
         JOIN public.driver_round dr ON dr.id = rs.round_id
        WHERE rs.id = $1 AND rs.round_id = $2 AND dr.driver_id = $3
        FOR UPDATE OF rs`,
      [stopId, runId, driverId],
    );
    if (stop.rowCount === 0) throw new NotFoundError();

    // ⚠ Idempotent by state, not by a dedupe table: a stop already `done` has nothing left to do, and
    // a retry must read as success rather than as a conflict the driver has to think about.
    if (stop.rows[0].status === "done") {
      const prior = await tx.query(
        `SELECT state, count(*)::int AS n FROM public.round_package WHERE stop_id = $1 GROUP BY state`,
        [stopId],
      );
      const by = (s: string) => Number(prior.rows.find((r: any) => r.state === s)?.n ?? 0);
      return { collected: by("picked_up"), notAvailable: by("not_available") };
    }

    const rows = await tx.query(
      `SELECT id, shop_fulfillment_id FROM public.round_package WHERE stop_id = $1 AND state = 'assigned'`,
      [stopId],
    );

    const declared = new Map((body.packages ?? []).map((p) => [p.packageId, p]));
    let collected = 0;
    let notAvailable = 0;

    for (const r of rows.rows) {
      // Absent from the body means collected — the shape the app has always sent.
      const outcome = declared.get(r.shop_fulfillment_id)?.outcome ?? "picked_up";
      const note = declared.get(r.shop_fulfillment_id)?.note ?? null;

      await tx.query(
        `UPDATE public.round_package SET state = $2, settled_at = now() WHERE id = $1`,
        [r.id, outcome],
      );

      if (outcome === "picked_up") {
        collected += 1;
        // ⚠ See the note above — without this the planner collects it again, forever.
        await tx.query(
          `UPDATE public.shop_fulfillment
              SET status = 'collected', state_changed_at = now()
            WHERE id = $1 AND status = 'ready_for_pickup'`,
          [r.shop_fulfillment_id],
        );
      } else {
        notAvailable += 1;
        // ⚠ The package stays `ready_for_pickup` ON PURPOSE. A shop that could not supply it today
        // may supply it tomorrow, and a later wave should try again (the partial index is partial
        // for exactly this). The discrepancy is recorded; the work is not thrown away.
        await tx.query(
          `UPDATE public.round_package SET note = $2 WHERE id = $1`,
          [r.id, note ?? "Not available at collection."],
        );
      }
    }

    await tx.query(
      `UPDATE public.round_stop SET status = 'done', completed_at = now() WHERE id = $1`,
      [stopId],
    );
    await tx.query(
      `UPDATE public.driver_round SET status = 'in_progress', updated_at = now()
        WHERE id = $1 AND status = 'planned'`,
      [runId],
    );

    return { collected, notAvailable };
  });
}

/**
 * Hub check-in (FR-022, FR-023).
 *
 * ⚠ THE SPLIT IS SHOWN, NEVER DECIDED. `delivery_method` was chosen by the shopper at checkout (047);
 * this reads it. The driver classifies nothing, and this function writes that column under no
 * circumstances.
 *
 * ⚠ A STANDARD PACKAGE'S DRIVER-SIDE WORK ENDS HERE (FR-024). It enters no delivery round — not by
 * being filtered out later, but because the delivery gather selects on `delivery_method = 'same_day'`
 * and can never see it.
 */
export async function hubCheckin(
  runId: string,
  driverId: string,
): Promise<HubCheckinResponse> {
  return withTransaction(async (tx: any) => {
    const round = await tx.query(
      `SELECT id FROM public.driver_round
        WHERE id = $1 AND driver_id = $2 AND kind = 'collection' FOR UPDATE`,
      [runId, driverId],
    );
    if (round.rowCount === 0) throw new NotFoundError();

    const counts = await tx.query(
      `SELECT COALESCE(sf.delivery_method, 'standard') AS method,
              rp.state                                 AS state,
              count(*)::int                            AS n
         FROM public.round_package rp
         JOIN public.round_stop       rs ON rs.id = rp.stop_id
         JOIN public.shop_fulfillment sf ON sf.id = rp.shop_fulfillment_id
        WHERE rs.round_id = $1
        GROUP BY 1, 2`,
      [runId],
    );

    const n = (method: string, state: string) =>
      Number(counts.rows.find((r: any) => r.method === method && r.state === state)?.n ?? 0);

    const sameDay = n("same_day", "picked_up");
    const standard = n("standard", "picked_up");
    const arrived = sameDay + standard;
    const expected = counts.rows.reduce((a: number, r: any) => a + Number(r.n), 0);

    // ⚠ UNIQUE (round_id) makes a retry a retry. Without `DO NOTHING` a driver tapping twice in a
    // bad-signal loading bay gets an error for having succeeded.
    await tx.query(
      `INSERT INTO public.hub_checkin (round_id, driver_id, packages_expected, packages_arrived)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (round_id) DO NOTHING`,
      [runId, driverId, expected, arrived],
    );

    // ⚠ 064 — CLOSE THE HUB STOP TOO, or the round's own work item outlives the round.
    //
    // 064 made hub check-in a `round_stop`, which is what gives a driver something outstanding to see
    // (and somewhere to tap) once every shop has been collected. If checking in did not complete that
    // stop, `todayView` would keep offering it forever on a round already marked `completed` — the
    // mirror image of the defect the stop was added to fix.
    //
    // Guarded on `status <> 'done'` so a retry stays a no-op, like the check-in insert above.
    await tx.query(
      `UPDATE public.round_stop
          SET status = 'done', completed_at = now()
        WHERE round_id = $1 AND kind = 'hub_checkin' AND status <> 'done'`,
      [runId],
    );

    await tx.query(
      `UPDATE public.driver_round SET status = 'completed', updated_at = now() WHERE id = $1`,
      [runId],
    );

    return { scannedTotal: arrived, sameDayCount: sameDay, standardCount: standard };
  });
}

/** Report a package that could not be collected, outside the collect call (the 049 route). */
export async function reportIssue(
  runId: string,
  stopId: string,
  driverId: string,
  packageId: string | undefined,
  note: string | undefined,
): Promise<void> {
  const owns = await query(
    `SELECT 1 FROM public.round_stop rs
       JOIN public.driver_round dr ON dr.id = rs.round_id
      WHERE rs.id = $1 AND rs.round_id = $2 AND dr.driver_id = $3`,
    [stopId, runId, driverId],
  );
  if ((owns.rowCount ?? 0) === 0) throw new NotFoundError();

  await query(
    `UPDATE public.round_package
        SET state = 'not_available', settled_at = now()
      WHERE stop_id = $1 AND state = 'assigned'
        AND ($2::uuid IS NULL OR shop_fulfillment_id = $2::uuid)`,
    [stopId, packageId ?? null],
  );
}
