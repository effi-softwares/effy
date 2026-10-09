import type { Queryable } from "../lib/db";
import { COUNTED_REFUND_STATUSES } from "../lib/order-completion";

/**
 * Orders sold the OLD way — before the new delivery model was switched on (083).
 *
 * ⚠ "OLD-KIND" IS ONE FACT: THE ORDER HAS NO RECORDED DELIVERY TYPE. 079 never backfilled one, and
 * nothing may: such an order keeps exactly what it was sold (a same-day window, or a standard day a
 * carrier delivers) and is finished that way.
 *
 * ⚠ "STILL OPEN" IS DEFINED HERE AND NOWHERE ELSE: paid, with at least one live portion that has not
 * arrived, and not fully refunded. The go-live page's count, the order list's "still open" filter,
 * the alert, and the guard on the migration that removes the old arrangement must all mean the same
 * orders — a count that disagreed with the list it links to would send staff looking for orders that
 * are not there, and a guard that disagreed with the count would remove the old path under one.
 *
 * Pass the alias of the order row; the result is a boolean SQL expression.
 */
export const LEGACY_OPEN_ORDER_SQL = (orderAlias: string): string => `(
  ${orderAlias}.delivery_type IS NULL
  AND ${orderAlias}.status = 'paid'
  AND EXISTS (
        SELECT 1 FROM public.shop_fulfillment lsf
         WHERE lsf.order_id = ${orderAlias}.id
           AND lsf.status NOT IN ('withdrawn', 'unfulfillable')
           AND NOT EXISTS (SELECT 1 FROM public.package_arrival lpa WHERE lpa.shop_fulfillment_id = lsf.id))
  AND (${orderAlias}.grand_total_amount = 0
       OR COALESCE((SELECT SUM(lr.amount) FROM public.refund lr
                     WHERE lr.order_id = ${orderAlias}.id
                       AND lr.status IN (${COUNTED_REFUND_STATUSES.map((s) => `'${s}'`).join(", ")})), 0)
          < ${orderAlias}.grand_total_amount)
)`;

export interface LegacyOpenOrders {
  open: number;
  /**
   * When the last old-kind order closed (its last parcel arrived, or it was cancelled or refunded).
   * Only meaningful — and only returned — once none is open.
   */
  lastClosedAt: Date | null;
}

/** How many old-kind orders are still open, and (at zero) when the last one closed. */
export async function legacyOpenOrders(q: Queryable): Promise<LegacyOpenOrders> {
  const open = Number(
    (await q.query<{ n: string }>(`SELECT count(*) AS n FROM public."order" o WHERE ${LEGACY_OPEN_ORDER_SQL("o")}`)).rows[0]?.n ?? 0,
  );
  if (open > 0) return { open, lastClosedAt: null };
  const last = (
    await q.query<{ at: Date | null }>(
      `SELECT max(GREATEST(
                COALESCE((SELECT max(pa.arrived_at) FROM public.package_arrival pa
                            JOIN public.shop_fulfillment sf ON sf.id = pa.shop_fulfillment_id WHERE sf.order_id = o.id), o.updated_at),
                COALESCE((SELECT max(r.created_at) FROM public.refund r WHERE r.order_id = o.id), o.updated_at),
                o.updated_at)) AS at
         FROM public."order" o
        WHERE o.delivery_type IS NULL AND o.status IN ('paid', 'canceled')`,
    )
  ).rows[0]?.at ?? null;
  return { open: 0, lastClosedAt: last };
}
