// The physical order of a driver's day: shops, hub, load, deliver, return. A retried request or second
// phone walks past the app's controls; these gates do not. Inside a write: ownership → `assertRoundOpen`
// → the retry answer → these gates → the write.

import { emitMetric, metricNamespace, problem, type Queryable, type RequestScope } from "@effy/edge-shared";
import { IN_TRANSIT_SQL, TO_RETURN_SQL } from "@effy/edge-shared/delivery";
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

export type SequenceProblemType =
  | "stops_outstanding"
  | "run_not_loaded"
  | "finish_collection_first"
  | "return_parcels_first"
  | "finish_deliveries_first";

/** Nothing has been written; `sentence` says what to do first. */
export class SequenceError extends Error {
  constructor(
    readonly type: SequenceProblemType,
    readonly sentence: string,
    readonly issues: Array<{ field: string; message: string }> = [],
  ) {
    super(type);
    this.name = "SequenceError";
  }
}

/** With the sentence as `detail`, like `round_not_open`. */
export function sequenceProblem(err: SequenceError, scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  emitMetric(metricNamespace(), "SequenceRefused", 1, { type: err.type });
  return problem(409, err.type, "Not yet", err.sentence, scope, err.issues);
}

/** Every shop on the run must be collected or declared not available. */
export async function assertStopsSettled(db: Queryable, runId: string): Promise<void> {
  const res = await db.query<{ stop_id: string; shop_name: string | null }>(
    `SELECT rs.id AS stop_id, s.name AS shop_name
       FROM public.round_stop rs
       LEFT JOIN public.shop s ON s.id = rs.shop_id
      WHERE rs.round_id = $1 AND rs.kind = 'shop_pickup' AND rs.status NOT IN ('done', 'skipped')
      ORDER BY rs.seq NULLS LAST, s.name`,
    [runId],
  );
  if (res.rows.length === 0) return;
  const names = res.rows.map((r) => r.shop_name ?? "a shop");
  const sentence = names.length === 1
    ? `Collect from ${names[0]} first.`
    : `Collect from ${names.length} shops first: ${names.join(", ")}.`;
  throw new SequenceError("stops_outstanding", sentence, res.rows.map((r) => ({ field: "stopId", message: r.stop_id })));
}

/** Nothing on a drop before the van is loaded. */
export async function assertDropLoaded(db: Queryable, dropId: string, driverId: string): Promise<void> {
  const res = await db.query<{ status: string; round_id: string }>(
    `SELECT rs.status, rs.round_id
       FROM public.round_stop rs
       JOIN public.driver_round dr ON dr.id = rs.round_id
      WHERE rs.id = $1 AND dr.driver_id = $2 AND rs.kind = 'customer_drop'`,
    [dropId, driverId],
  );
  const row = res.rows[0];
  if (row?.status === "pending") {
    throw new SequenceError("run_not_loaded", "Load the van first.", [{ field: "runId", message: row.round_id }]);
  }
}

async function waived(db: Queryable, runId: string): Promise<boolean> {
  const res = await db.query(`SELECT 1 FROM public.round_sequence_waiver WHERE round_id = $1`, [runId]);
  return (res.rowCount ?? 0) > 0;
}

/** Loading waits until the van holds nothing else: no parcel still to check in or return. */
export async function assertNothingToHandIn(db: Queryable, driverId: string, runId: string): Promise<void> {
  if (await waived(db, runId)) return;

  const collected = await db.query<{ round_id: string }>(
    `SELECT dr.id AS round_id
       FROM public.round_package rp
       JOIN public.round_stop    rs ON rs.id = rp.stop_id
       JOIN public.driver_round  dr ON dr.id = rs.round_id
      WHERE dr.driver_id = $1 AND dr.kind = 'collection' AND rp.state = 'picked_up'
        AND NOT EXISTS (SELECT 1 FROM public.hub_checkin hc WHERE hc.round_id = dr.id)
        AND NOT EXISTS (SELECT 1 FROM public.package_arrival pa WHERE pa.shop_fulfillment_id = rp.shop_fulfillment_id)
      LIMIT 1`,
    [driverId],
  );
  if (collected.rows[0]) {
    throw new SequenceError("finish_collection_first", "Check in the parcels you collected first.", [
      { field: "runId", message: collected.rows[0].round_id },
    ]);
  }

  const toReturn = await db.query<{ round_id: string }>(
    `SELECT dr.id AS round_id
       FROM public.round_package rp
       JOIN public.round_stop    rs ON rs.id = rp.stop_id
       JOIN public.driver_round  dr ON dr.id = rs.round_id
      WHERE dr.driver_id = $1 AND dr.id <> $2 AND ${TO_RETURN_SQL}
      LIMIT 1`,
    [driverId, runId],
  );
  if (toReturn.rows[0]) {
    throw new SequenceError("return_parcels_first", "Return the parcels from your last run first.", [
      { field: "runId", message: toReturn.rows[0].round_id },
    ]);
  }
}

/** Inbound and outbound parcels never mix in the van. */
export async function assertNoDeliveriesOpen(db: Queryable, driverId: string, runId: string): Promise<void> {
  if (await waived(db, runId)) return;
  const res = await db.query<{ round_id: string }>(
    `SELECT dr.id AS round_id
       FROM public.round_package rp
       JOIN public.round_stop    rs ON rs.id = rp.stop_id
       JOIN public.driver_round  dr ON dr.id = rs.round_id
      WHERE dr.driver_id = $1 AND ${IN_TRANSIT_SQL}
      LIMIT 1`,
    [driverId],
  );
  if (res.rows[0]) {
    throw new SequenceError("finish_deliveries_first", "Finish your deliveries first.", [
      { field: "runId", message: res.rows[0].round_id },
    ]);
  }
}
