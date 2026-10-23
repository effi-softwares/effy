// Staff record that a package arrived: the route to `delivered` for a package no driver delivers.

import { enqueueOrderDeliveredIfComplete, withTransaction } from "@effy/edge-shared";

import { OrderActionError } from "../lib/errors";

export interface ArrivalResult {
  /** false when this call found the arrival already recorded. */
  created: boolean;
  arrivedAt: string;
  /** This arrival completed the order. */
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
 * Idempotent twice over: the status-guarded UPDATE makes a repeat a no-op that returns the original
 * `arrived_at`, and `package_arrival_package_uq` refuses a second insert regardless of this code.
 */
export async function recordArrival(input: RecordArrivalInput): Promise<ArrivalResult> {
  return withTransaction(async (tx) => {
    // The lock is taken in its own statement first: `FOR UPDATE OF sf` on the joined read handed a
    // waiting caller stale joined rows, refusing its replay. Now the read starts after the winner commits.
    await tx.query(`SELECT 1 FROM public.shop_fulfillment WHERE id = $1 FOR UPDATE`, [input.fulfillmentId]);

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

    // Already arrived: report the original time.
    if (row.arrived_at) {
      return {
        created: false,
        arrivedAt: new Date(row.arrived_at).toISOString(),
        orderFinished: await enqueueOrderDeliveredIfComplete(tx, row.order_id),
        orderId: row.order_id,
      };
    }

    if (row.status !== "collected") throw new OrderActionError("not_collected");

    // A handover must be recorded first, or nobody can say who had it.
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
      // Lost the race; the other arrival stands.
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

    await tx.query(
      `INSERT INTO public.fulfillment_event
           (shop_fulfillment_id, event_type, from_status, to_status)
       VALUES ($1, 'state_changed', 'collected', 'delivered')`,
      [input.fulfillmentId],
    );

    // Only for the last package, in this transaction, so intent and fact commit together.
    const orderFinished = await enqueueOrderDeliveredIfComplete(tx, row.order_id);

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

