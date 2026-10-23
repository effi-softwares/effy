// The rollup job: drain the dirty queue and recompute those buckets from source, never increment (a
// refund can be rejected thirty days later, so figures move backwards). Recomputing is idempotent. The
// dirty table is the queue; what is monitored is the age of its oldest row.
import { query, withTransaction } from "@effy/edge-shared";

/** Bounded so a backlog drains steadily instead of in one long lock. */
export const CLAIM_LIMIT = 500;

export interface RollupResult {
  buckets: number;
  shops: number;
  /** The backlog-age alarm's input. */
  oldestBacklogMs: number;
}

interface DirtyRow {
  shop_id: string;
  bucket_start: Date;
  marked_at: Date;
  timezone: string;
}

/** `FOR UPDATE SKIP LOCKED`, so overlapping runs never fight; the worst case is wasted work. */
const CLAIM = `
SELECT d.shop_id::text, d.bucket_start, d.marked_at, s.timezone
  FROM public.insights_dirty d
  JOIN public.shop s ON s.id = d.shop_id
 ORDER BY d.marked_at
 LIMIT $1
   FOR UPDATE OF d SKIP LOCKED
`;

/**
 * Recomputes every claimed bucket for one shop in one statement, for the hours in `$2`:
 *  • gross_goods / orders / units: this shop's lines on orders paid in the bucket (`canceled` counts:
 *  it was paid, and its money returns as a refund).
 *  • refunds: issued in the bucket and attributed to this shop. An item refund is the sum of its
 *  lines; a cancellation is the shop's goods on the order less what was already refunded, floored at
 *  zero. Goodwill and external refunds are never a shop's. Only `submitted` and `succeeded` count.
 *  • cant_supply / cancelled: from the append-only `fulfillment_event`, not the overwritten status.
 */
const RECOMPUTE = `
INSERT INTO public.shop_sales_hour AS t (
  shop_id, bucket_start, gross_goods, refunds, refunded_orders, orders, units,
  cant_supply, cant_supply_units, cancelled, computed_at)
SELECT $1::uuid,
       b.bucket_start,
       COALESCE(sales.gross, 0),
       COALESCE(ref.amount, 0),
       COALESCE(ref.orders, 0),
       COALESCE(sales.orders, 0),
       COALESCE(sales.units, 0),
       COALESCE(ev.cant_supply, 0),
       COALESCE(ev.cant_supply_units, 0),
       COALESCE(ev.cancelled, 0),
       now()
  FROM unnest($2::timestamptz[]) AS b(bucket_start)
  LEFT JOIN LATERAL (
    -- ⚠ a shop's sales are what the SHOP is owed — its own prices — not what customers paid.
    SELECT SUM(oi.shop_line_subtotal_amount) AS gross,
           SUM(oi.quantity)::int        AS units,
           COUNT(DISTINCT sf.id)::int   AS orders
      FROM public."order" o
      JOIN public.order_item oi ON oi.order_id = o.id AND oi.shop_id = $1::uuid
      JOIN public.shop_fulfillment sf ON sf.order_id = o.id AND sf.shop_id = $1::uuid
     WHERE o.status IN ('paid', 'canceled')
       AND public.shop_local_hour(COALESCE(o.placed_at, o.created_at), $3) = b.bucket_start
  ) sales ON true
  LEFT JOIN LATERAL (
    SELECT SUM(share.amount) AS amount, COUNT(DISTINCT share.order_id)::int AS orders
      FROM (
        SELECT r.order_id,
               CASE WHEN r.kind = 'cancellation'
                    THEN GREATEST(0, (
                           SELECT COALESCE(SUM(oi.shop_line_subtotal_amount), 0)
                             FROM public.order_item oi
                            WHERE oi.order_id = r.order_id AND oi.shop_id = $1::uuid
                         ) - (
                           -- What was already refunded from this shop's goods, AT THE SHOP'S
                           -- PRICE. refund_line.amount is customer money (what went back to the
                           -- card); the shop's share of it is the units times its own unit price.
                           SELECT COALESCE(SUM(rl2.quantity * COALESCE(oi2.shop_unit_price_amount, oi2.unit_price_amount)), 0)
                             FROM public.refund_line rl2
                             JOIN public.refund r2 ON r2.id = rl2.refund_id
                             JOIN public.order_item oi2 ON oi2.id = rl2.order_item_id
                            WHERE r2.order_id = r.order_id
                              AND oi2.shop_id = $1::uuid
                              AND r2.status IN ('submitted', 'succeeded')
                         ))
                    ELSE (
                           SELECT COALESCE(SUM(rl.quantity * COALESCE(oi3.shop_unit_price_amount, oi3.unit_price_amount)), 0)
                             FROM public.refund_line rl
                             JOIN public.order_item oi3 ON oi3.id = rl.order_item_id
                            WHERE rl.refund_id = r.id AND oi3.shop_id = $1::uuid
                         )
               END AS amount
          FROM public.refund r
         WHERE r.status IN ('submitted', 'succeeded')
           AND r.kind IN ('item', 'cancellation')
           AND public.shop_local_hour(r.created_at, $3) = b.bucket_start
      ) share
     WHERE share.amount > 0
  ) ref ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE fe.to_status = 'unfulfillable')::int AS cant_supply,
           COUNT(*) FILTER (WHERE fe.to_status = 'withdrawn')::int     AS cancelled,
           COALESCE(SUM(
             CASE WHEN fe.to_status = 'unfulfillable'
                  THEN (SELECT COALESCE(SUM(fi.unavailable_quantity), 0)
                          FROM public.fulfillment_item fi
                         WHERE fi.shop_fulfillment_id = fe.shop_fulfillment_id)
                  ELSE 0 END), 0)::int AS cant_supply_units
      FROM public.fulfillment_event fe
      JOIN public.shop_fulfillment sf ON sf.id = fe.shop_fulfillment_id AND sf.shop_id = $1::uuid
     WHERE fe.to_status IN ('unfulfillable', 'withdrawn')
       AND public.shop_local_hour(fe.occurred_at, $3) = b.bucket_start
  ) ev ON true
ON CONFLICT (shop_id, bucket_start) DO UPDATE SET
  gross_goods       = EXCLUDED.gross_goods,
  refunds           = EXCLUDED.refunds,
  refunded_orders   = EXCLUDED.refunded_orders,
  orders            = EXCLUDED.orders,
  units             = EXCLUDED.units,
  cant_supply       = EXCLUDED.cant_supply,
  cant_supply_units = EXCLUDED.cant_supply_units,
  cancelled         = EXCLUDED.cancelled,
  computed_at       = EXCLUDED.computed_at
`;

/**
 * Wipes the product rows for the local dates being recomputed, so a product can drop out of a day. A
 * separate statement: as a CTE on the INSERT, both share a snapshot and the insert hits the pkey.
 */
const WIPE_PRODUCTS = `
DELETE FROM public.shop_product_sales_day p
 USING (
   SELECT DISTINCT (b.bucket_start AT TIME ZONE $3)::date AS local_date
     FROM unnest($2::timestamptz[]) AS b(bucket_start)
 ) d
 WHERE p.shop_id = $1::uuid AND p.local_date = d.local_date
`;

/** For the local dates the recomputed hours fall in. */
const RECOMPUTE_PRODUCTS = `
WITH days AS (
  SELECT DISTINCT (b.bucket_start AT TIME ZONE $3)::date AS local_date
    FROM unnest($2::timestamptz[]) AS b(bucket_start)
)
INSERT INTO public.shop_product_sales_day (shop_id, local_date, product_id, units, gross_goods)
SELECT $1::uuid,
       (public.shop_local_hour(COALESCE(o.placed_at, o.created_at), $3) AT TIME ZONE $3)::date,
       oi.product_id,
       SUM(oi.quantity)::int,
       SUM(oi.shop_line_subtotal_amount)
  FROM public."order" o
  JOIN public.order_item oi ON oi.order_id = o.id AND oi.shop_id = $1::uuid
 WHERE o.status IN ('paid', 'canceled')
   AND (public.shop_local_hour(COALESCE(o.placed_at, o.created_at), $3) AT TIME ZONE $3)::date
       IN (SELECT local_date FROM days)
 GROUP BY 2, 3
`;

const CLEAR_CLAIMED = `
DELETE FROM public.insights_dirty
 WHERE shop_id = $1::uuid AND bucket_start = ANY($2::timestamptz[])
`;

const TOUCH_STATE = `
INSERT INTO public.insights_state (shop_id, timezone, computed_at)
VALUES ($1::uuid, $2, now())
ON CONFLICT (shop_id) DO UPDATE SET timezone = EXCLUDED.timezone, computed_at = EXCLUDED.computed_at
`;

/** Claim, recompute, clear and advance the watermark in one transaction, or a correction could be lost. */
export async function runRollup(limit = CLAIM_LIMIT): Promise<RollupResult> {
  return withTransaction(async (tx) => {
    const claimed = await tx.query<DirtyRow>(CLAIM, [limit]);
    if (claimed.rows.length === 0) {
      return { buckets: 0, shops: 0, oldestBacklogMs: 0 };
    }

    const byShop = new Map<string, { timezone: string; buckets: Date[] }>();
    let oldest = claimed.rows[0]!.marked_at;
    for (const row of claimed.rows) {
      const entry = byShop.get(row.shop_id) ?? { timezone: row.timezone, buckets: [] };
      entry.buckets.push(row.bucket_start);
      byShop.set(row.shop_id, entry);
      if (row.marked_at < oldest) oldest = row.marked_at;
    }

    for (const [shopId, { timezone, buckets }] of byShop) {
      await tx.query(RECOMPUTE, [shopId, buckets, timezone]);
      await tx.query(WIPE_PRODUCTS, [shopId, buckets, timezone]);
      await tx.query(RECOMPUTE_PRODUCTS, [shopId, buckets, timezone]);
      await tx.query(CLEAR_CLAIMED, [shopId, buckets]);
      await tx.query(TOUCH_STATE, [shopId, timezone]);
    }

    return {
      buckets: claimed.rows.length,
      shops: byShop.size,
      oldestBacklogMs: Date.now() - oldest.getTime(),
    };
  });
}

/** Keeps the current hour fresh, so "nothing sold since" is distinguishable from "figures stopped". */
export async function markCurrentHours(): Promise<number> {
  const res = await query(
    `INSERT INTO public.insights_dirty (shop_id, bucket_start)
     SELECT s.id, public.shop_local_hour(now(), s.timezone)
       FROM public.shop s
      WHERE s.status = 'active'
        AND EXISTS (
              SELECT 1 FROM public.order_item oi
                JOIN public."order" o ON o.id = oi.order_id
               WHERE oi.shop_id = s.id
                 AND o.status IN ('paid','canceled')
                 AND COALESCE(o.placed_at, o.created_at) >= now() - interval '1 hour')
     ON CONFLICT DO NOTHING`,
    [],
  );
  return res.rowCount ?? 0;
}
