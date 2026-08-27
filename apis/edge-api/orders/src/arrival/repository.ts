// Recording that a package arrived (053 US2) — the transaction this whole feature exists for.
//
// Before this slice, a STANDARD package could never leave `collected`: `edge-api/driver` writes
// `delivered` only from a delivery task, and delivery tasks are created only for `same_day`
// packages. So most orders never finished. This is the other route to the same terminal state.

import { enqueueOrderDeliveredIfComplete, query, withTransaction } from "@effy/edge-shared";

import { OrderActionError } from "../lib/errors";

export interface ArrivalResult {
  /** false when this call found the arrival already recorded — the idempotent replay (FR-005). */
  created: boolean;
  arrivedAt: string;
  /** True when this arrival completed the order (every package now has one). */
  orderFinished: boolean;
  orderId: string;
}

export interface RecordArrivalInput {
  fulfillmentId: string;
  actorSub: string;
  arrivedAt?: string;
  note?: string;
  changeId: string;
}

/**
 * Record an arrival, idempotently.
 *
 * ⚠ IDEMPOTENCY IS THE `FinalizeSucceeded` SHAPE (checkout/store.go), and it is belt AND braces:
 *
 *  1. The row lock + status-guarded UPDATE (`WHERE id = $1 AND status = 'collected'`) means a second
 *     call affects 0 rows and takes the early return — no second notification, and critically the
 *     ORIGINAL `arrived_at` is returned untouched. A "successful" repeat that silently moved the
 *     arrival time would corrupt the one fact this table exists to hold.
 *  2. `package_arrival_package_uq` is a UNIQUE the DATABASE enforces, independent of this code. If
 *     this function were ever called twice concurrently, or rewritten wrongly, the second insert
 *     still cannot land.
 *
 * The two guarantees are deliberately not the same mechanism: code can be edited, a constraint
 * cannot be edited by accident.
 */
export async function recordArrival(input: RecordArrivalInput): Promise<ArrivalResult> {
  return withTransaction(async (tx) => {
    // FOR UPDATE: serialise concurrent attempts on this package so two operators pressing at once
    // resolve to one winner and one idempotent replay, rather than racing the status guard.
    const pkg = await tx.query<{
      id: string;
      order_id: string;
      status: string;
      method: string | null;
      has_handoff: boolean;
      arrived_at: string | null;
    }>(
      `SELECT sf.id,
              sf.order_id,
              sf.status,
              opd.method,
              (h.id IS NOT NULL) AS has_handoff,
              pa.arrived_at
         FROM public.shop_fulfillment sf
    LEFT JOIN public.order_package_delivery opd
           ON opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id
    LEFT JOIN public.carrier_handoff h ON h.shop_fulfillment_id = sf.id
    LEFT JOIN public.package_arrival pa ON pa.shop_fulfillment_id = sf.id
        WHERE sf.id = $1
          FOR UPDATE OF sf`,
      [input.fulfillmentId],
    );

    const row = pkg.rows[0];
    if (!row) throw new OrderActionError("not_found");

    // Already arrived → the idempotent replay. Report the ORIGINAL time, not a new one.
    if (row.arrived_at) {
      return {
        created: false,
        arrivedAt: new Date(row.arrived_at).toISOString(),
        orderFinished: await enqueueOrderDeliveredIfComplete(tx, row.order_id),
        orderId: row.order_id,
      };
    }

    if (row.status !== "collected") throw new OrderActionError("not_collected");

    // ⚠ FR-006. A same-day package reaches `delivered` through the driver's proof-of-delivery, not
    // here; a standard one must have a recorded handover first, or nobody can say who had it.
    if (!row.has_handoff) throw new OrderActionError("no_handoff");

    const arrivedAt = input.arrivedAt ?? new Date().toISOString();

    await tx.query(
      `INSERT INTO public.package_arrival
           (shop_fulfillment_id, arrived_at, source, recorded_by_sub, note)
       VALUES ($1, $2::timestamptz, 'staff_recorded', $3, $4)
       ON CONFLICT (shop_fulfillment_id) DO NOTHING`,
      [input.fulfillmentId, arrivedAt, input.actorSub, input.note ?? null],
    );

    const advanced = await tx.query(
      `UPDATE public.shop_fulfillment
          SET status = 'delivered', state_changed_at = now(), updated_at = now()
        WHERE id = $1 AND status = 'collected'`,
      [input.fulfillmentId],
    );
    if (advanced.rowCount === 0) {
      // Someone else won the race between the SELECT and here. Their arrival stands.
      const existing = await tx.query<{ arrived_at: string }>(
        `SELECT arrived_at FROM public.package_arrival WHERE shop_fulfillment_id = $1`,
        [input.fulfillmentId],
      );
      return {
        created: false,
        arrivedAt: new Date(existing.rows[0]!.arrived_at).toISOString(),
        orderFinished: await enqueueOrderDeliveredIfComplete(tx, row.order_id),
        orderId: row.order_id,
      };
    }

    // The append-only accountability record the shop console already reads (020 FR-019a).
    await tx.query(
      `INSERT INTO public.fulfillment_event
           (shop_fulfillment_id, event_type, from_status, to_status)
       VALUES ($1, 'state_changed', 'collected', 'delivered')`,
      [input.fulfillmentId],
    );

    // ⚠ Only when this was the LAST package (FR-007). Enqueued in THIS transaction so the intent and
    // the fact commit together.
    const orderFinished = await enqueueOrderDeliveredIfComplete(tx, row.order_id);

    // FR-014 — attributed, and retained where 009 put every other back-office action.
    await tx.query(
      `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
       VALUES ($1, 'order.arrival_recorded', 'shop_fulfillment', $2, $3::jsonb)`,
      [
        input.actorSub,
        input.fulfillmentId,
        JSON.stringify({
          orderId: row.order_id,
          arrivedAt,
          changeId: input.changeId,
          orderFinished,
        }),
      ],
    );

    return { created: true, arrivedAt, orderFinished, orderId: row.order_id };
  });
}

/** Whether an order has any package still awaiting arrival — used by the list's `awaiting` filter. */
export async function orderIsFinished(orderId: string): Promise<boolean> {
  const res = await query<{ finished: boolean }>(
    `SELECT NOT EXISTS (
       SELECT 1 FROM public.shop_fulfillment sf
    LEFT JOIN public.package_arrival pa ON pa.shop_fulfillment_id = sf.id
        WHERE sf.order_id = $1 AND pa.id IS NULL
     ) AS finished`,
    [orderId],
  );
  return res.rows[0]?.finished ?? false;
}
