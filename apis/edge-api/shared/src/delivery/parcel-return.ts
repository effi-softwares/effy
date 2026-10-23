// Parcels from a failed delivery, and their return to the hub: one writer (`recordParcelReturn`) for the
// driver's app and for staff. "TO RETURN" is derived (an `assigned` package on a `skipped` stop); the
// return records `state = 'returned'` and a `parcel_return` row.

import type { ParcelDTO } from "@effy/shared-types";

import type { Queryable } from "../lib/db";
import { liveParcelsByPackage } from "../labels/parcels";

/** Still in a van after a failed drop: `assigned` on a `skipped` delivery stop with no arrival. A predicate over `rp`, `rs`, `dr`. */
export const TO_RETURN_SQL = `(
  dr.kind = 'delivery'
  AND rp.state = 'assigned'
  AND rs.status = 'skipped'
  AND NOT EXISTS (SELECT 1 FROM public.package_arrival pa WHERE pa.shop_fulfillment_id = rp.shop_fulfillment_id)
)`;

/** On the way to a door: `assigned` on a drop the driver has started (a staged drop is not counted). */
export const IN_TRANSIT_SQL = `(
  dr.kind = 'delivery'
  AND rp.state = 'assigned'
  AND rs.status IN ('out_for_delivery', 'en_route', 'arrived')
  AND NOT EXISTS (SELECT 1 FROM public.package_arrival pa WHERE pa.shop_fulfillment_id = rp.shop_fulfillment_id)
)`;

const TO_RETURN_ON_ROUND = `
  SELECT rp.id, rp.shop_fulfillment_id AS package_id, o.order_number, sf.package_code,
         concat_ws(', ', nullif(btrim(o.delivery_address ->> 'line1'), ''), nullif(btrim(o.delivery_address ->> 'city'), '')) AS place,
         (SELECT f.reason FROM public.delivery_attempt_failure f WHERE f.stop_id = rs.id ORDER BY f.failed_at DESC LIMIT 1) AS reason
    FROM public.round_package rp
    JOIN public.round_stop    rs ON rs.id = rp.stop_id
    JOIN public.driver_round  dr ON dr.id = rs.round_id
    JOIN public."order"       o  ON o.id = rs.order_id
    JOIN public.shop_fulfillment sf ON sf.id = rp.shop_fulfillment_id
   WHERE dr.id = $1
     AND ${TO_RETURN_SQL}
   ORDER BY rs.seq NULLS LAST, o.order_number, rp.id
`;

/** A count and the orders (no address). */
export interface ToReturn {
  runId: string;
  count: number;
  orders: string[];
  /** Server-side only; not on the driver wire. */
  packageIds: string[];
  /** Each parcel: its order, label code, where it was for, and why it came back. */
  parcels: Array<{ ref: string; packageCode: string; place: string | null; reason: ReturnReason | null; parcels: ParcelDTO[] }>;
}

type ReturnReason = "nobody_home" | "wrong_address" | "customer_refused" | "access_blocked" | "other";

export async function toReturnOnRound(db: Queryable, roundId: string): Promise<ToReturn | null> {
  const res = await db.query<{ id: string; package_id: string; order_number: string; package_code: string; place: string | null; reason: ReturnReason | null }>(TO_RETURN_ON_ROUND, [roundId]);
  if (res.rows.length === 0) return null;
  // Each package's live bags: the return scan accounts for every one.
  const bags = await liveParcelsByPackage(db, res.rows.map((r) => r.package_id));
  return {
    runId: roundId,
    count: res.rows.length,
    orders: [...new Set(res.rows.map((r) => r.order_number))],
    packageIds: res.rows.map((r) => r.package_id),
    parcels: res.rows.map((r) => ({ ref: r.order_number, packageCode: r.package_code, place: r.place || null, reason: r.reason, parcels: bags.get(r.package_id) ?? [] })),
  };
}

/**
 * The one completion rule for delivery rounds: no drop open and nothing left to return. The round row
 * is locked first, so two drops settled at once cannot each see the other open.
 */
export async function completeDeliveryRoundIfFinished(tx: Queryable, roundId: string): Promise<boolean> {
  await tx.query(`SELECT id FROM public.driver_round WHERE id = $1 FOR UPDATE`, [roundId]);
  const done = await tx.query(
    `UPDATE public.driver_round dr
        SET status = 'completed', updated_at = now()
      WHERE dr.id = $1
        AND dr.kind = 'delivery'
        AND dr.status IN ('planned', 'in_progress')
        AND NOT EXISTS (
              SELECT 1 FROM public.round_stop rs
               WHERE rs.round_id = dr.id AND rs.status NOT IN ('done', 'skipped'))
        AND NOT EXISTS (
              SELECT 1 FROM public.round_package rp
                JOIN public.round_stop rs ON rs.id = rp.stop_id
               WHERE rs.round_id = dr.id AND ${TO_RETURN_SQL})
      RETURNING id`,
    [roundId],
  );
  return (done.rowCount ?? 0) > 0;
}

export interface RecordParcelReturnInput {
  roundId: string;
  /** Set when a driver returns: the round must be theirs. */
  driverId?: string;
  recordedBy: "driver" | "staff";
  recordedBySub: string;
  changeId: string;
}

export interface ParcelReturnResult {
  returned: number;
  roundComplete: boolean;
  /** Told by a live update when staff returned for them. */
  driverId: string;
  replayed: boolean;
}

export class ParcelReturnRoundNotFoundError extends Error {
  constructor() {
    super("round not found");
    this.name = "ParcelReturnRoundNotFoundError";
  }
}

/**
 * Inside a transaction. Idempotent on `changeId`; nothing to return is `returned: 0`, not an error;
 * the recorded failure is never touched.
 */
export async function recordParcelReturn(tx: Queryable, input: RecordParcelReturnInput): Promise<ParcelReturnResult> {
  const prior = await tx.query<{ package_count: number; round_id: string; driver_id: string }>(
    `SELECT package_count, round_id, driver_id FROM public.parcel_return WHERE change_id = $1`,
    [input.changeId],
  );
  if (prior.rows[0]) {
    const status = await tx.query<{ status: string }>(`SELECT status FROM public.driver_round WHERE id = $1`, [prior.rows[0].round_id]);
    return {
      returned: Number(prior.rows[0].package_count),
      roundComplete: status.rows[0]?.status === "completed",
      driverId: prior.rows[0].driver_id,
      replayed: true,
    };
  }

  // Scoped to the driver, so "not yours" and "no such round" are one answer.
  const round = await tx.query<{ id: string; driver_id: string; status: string }>(
    `SELECT id, driver_id, status FROM public.driver_round
      WHERE id = $1 AND kind = 'delivery' AND ($2::uuid IS NULL OR driver_id = $2::uuid)
      FOR UPDATE`,
    [input.roundId, input.driverId ?? null],
  );
  const r = round.rows[0];
  if (!r) throw new ParcelReturnRoundNotFoundError();

  const parcels = await tx.query<{ id: string }>(TO_RETURN_ON_ROUND, [input.roundId]);
  const ids = parcels.rows.map((p) => p.id);

  if (ids.length > 0) {
    const ret = await tx.query<{ id: string }>(
      `INSERT INTO public.parcel_return (round_id, driver_id, recorded_by, recorded_by_sub, package_count, change_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [input.roundId, r.driver_id, input.recordedBy, input.recordedBySub, ids.length, input.changeId],
    );
    await tx.query(
      `UPDATE public.round_package
          SET state = 'returned', settled_at = now(), return_id = $2
        WHERE id = ANY($1::uuid[]) AND state = 'assigned'`,
      [ids, ret.rows[0]!.id],
    );
    await tx.query(`UPDATE public.driver_round SET updated_at = now() WHERE id = $1`, [input.roundId]);
  }

  const roundComplete = (await completeDeliveryRoundIfFinished(tx, input.roundId)) || r.status === "completed";
  return { returned: ids.length, roundComplete, driverId: r.driver_id, replayed: false };
}
