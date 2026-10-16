// Parcels from a failed delivery, and their return to the hub (088, driver backlog A4).
//
// ⚠ ONE WRITER, TWO CALLERS. A driver returns parcels from the app (`edge-api/driver`); a staff member
// records the return on their behalf (`edge-api/fleet`). Both go through `recordParcelReturn` — the
// same rule in two services would agree today and disagree the first time one of them changed.
//
// ⚠ "TO RETURN" IS DERIVED, NEVER STORED (research R1). A parcel is in the van after a failed drop
// because its delivery `round_package` is still `assigned` on a stop that was `skipped`. The return is
// the only new fact: `state = 'returned'`, and a `parcel_return` row saying who and when.

import type { Queryable } from "../lib/db";

/**
 * Delivery parcels still in a driver's van after a failed drop: `assigned` on a `skipped` stop of a
 * delivery round, with no arrival. Used as a predicate over `rp` (round_package), `rs` (round_stop)
 * and `dr` (driver_round) — the one definition custody, the exceptions list and the driver's reads share.
 */
export const TO_RETURN_SQL = `(
  dr.kind = 'delivery'
  AND rp.state = 'assigned'
  AND rs.status = 'skipped'
  AND NOT EXISTS (SELECT 1 FROM public.package_arrival pa WHERE pa.shop_fulfillment_id = rp.shop_fulfillment_id)
)`;

/**
 * Delivery parcels on their way to a door: `assigned` on a drop the driver has started. A `pending`
 * (staged) drop is NOT counted — with no "load the van" step yet, a staged parcel may still be on a
 * hub shelf (research R2).
 */
export const IN_TRANSIT_SQL = `(
  dr.kind = 'delivery'
  AND rp.state = 'assigned'
  AND rs.status IN ('out_for_delivery', 'en_route', 'arrived')
  AND NOT EXISTS (SELECT 1 FROM public.package_arrival pa WHERE pa.shop_fulfillment_id = rp.shop_fulfillment_id)
)`;

/** The parcels on one round still to return, with their order numbers. */
const TO_RETURN_ON_ROUND = `
  SELECT rp.id, o.order_number, sf.package_code
    FROM public.round_package rp
    JOIN public.round_stop    rs ON rs.id = rp.stop_id
    JOIN public.driver_round  dr ON dr.id = rs.round_id
    JOIN public."order"       o  ON o.id = rs.order_id
    JOIN public.shop_fulfillment sf ON sf.id = rp.shop_fulfillment_id
   WHERE dr.id = $1
     AND ${TO_RETURN_SQL}
   ORDER BY rs.seq NULLS LAST, o.order_number, rp.id
`;

/** What a driver still has to bring back from one round: a count and the orders (no address). */
export interface ToReturn {
  runId: string;
  count: number;
  orders: string[];
  /** 090 — the parcels' label codes, for the return scan. */
  packageCodes: string[];
}

export async function toReturnOnRound(db: Queryable, roundId: string): Promise<ToReturn | null> {
  const res = await db.query<{ id: string; order_number: string; package_code: string }>(TO_RETURN_ON_ROUND, [roundId]);
  if (res.rows.length === 0) return null;
  return {
    runId: roundId,
    count: res.rows.length,
    orders: [...new Set(res.rows.map((r) => r.order_number))],
    packageCodes: res.rows.map((r) => r.package_code),
  };
}

/**
 * Close a delivery round that is finished: no drop still open AND nothing left to return (088 R3).
 *
 * ⚠ THE ONE COMPLETION RULE FOR DELIVERY ROUNDS. Until driver backlog A1 nothing closed a delivery
 * round at all; A1 closed it on its last settled drop; 088 adds the second condition — a round whose
 * failed parcels are still in the van is not finished, from anyone's point of view.
 *
 * The round row is locked first: two drops on one round settled at the same moment would otherwise
 * each see the other still open, and neither would close it.
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
  /** Set when a DRIVER returns: the round must be theirs. Omitted for a staff return. */
  driverId?: string;
  recordedBy: "driver" | "staff";
  recordedBySub: string;
  changeId: string;
}

export interface ParcelReturnResult {
  returned: number;
  roundComplete: boolean;
  /** The round's driver — told by a live update when staff returned on their behalf. */
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
 * Return every parcel on a delivery round that is still to return (FR-004). Call inside a transaction.
 *
 * - Idempotent on `changeId` (FR-005): a replay answers with what the first call did.
 * - Nothing to return is a success with `returned: 0`, never an error — a second tap after the first
 *   landed must not be something the driver has to think about.
 * - Never touches the recorded failure (FR-013): reason, note and time stay as the driver wrote them.
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

  // ⚠ Scoped to the driver for a driver's call, so "not yours" and "no such round" are one answer.
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
