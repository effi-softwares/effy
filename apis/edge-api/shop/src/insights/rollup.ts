// The rollup job: drain the dirty queue, recompute those buckets FROM SOURCE (058, US3).
//
// ⚠ RECOMPUTED, NEVER INCREMENTED (research R5). An incremental `+=` is exact only if every change
// arrives exactly once and in order. Effy's corrections do neither: 055 is explicit that a submitted
// refund can be rejected by the bank up to thirty days later, so a figure can move BACKWARDS long
// after the fact. Recomputing a bucket from the rows that define it is idempotent — running it
// twice, late, or after a reversal gives the same answer — so there is no drift to reconcile and no
// "how did this get out of step?" to debug at quarter end.
//
// ⚠ THE DIRTY TABLE IS THE QUEUE, so there is no dead-letter queue: a run that fails leaves its rows
// exactly where they were and the next minute picks them up. What is monitored is the AGE of the
// oldest row — "how far behind are the figures", which is the only version of the question anyone
// actually asks.
import { query, withTransaction } from "@effy/edge-shared";

/** How many buckets one run claims. Bounded so a backlog drains steadily instead of in one long lock. */
export const CLAIM_LIMIT = 500;

export interface RollupResult {
  buckets: number;
  shops: number;
  /** Age of the oldest claimed mark, in ms — the backlog-age alarm's input. */
  oldestBacklogMs: number;
}

interface DirtyRow {
  shop_id: string;
  bucket_start: Date;
  marked_at: Date;
  timezone: string;
}

/**
 * Claim work.
 *
 * ⚠ `FOR UPDATE SKIP LOCKED` so two concurrent runs (a slow one still finishing when the next minute
 * fires) never fight over the same bucket or block each other. Recomputation is idempotent, so the
 * worst case of an overlap is wasted work, never a wrong number.
 */
const CLAIM = `
SELECT d.shop_id::text, d.bucket_start, d.marked_at, s.timezone
  FROM public.insights_dirty d
  JOIN public.shop s ON s.id = d.shop_id
 ORDER BY d.marked_at
 LIMIT $1
   FOR UPDATE OF d SKIP LOCKED
`;

/**
 * Recompute every claimed bucket for ONE shop, in one statement.
 *
 * Each column is derived from the rows that define it, for exactly the hours named in `$2`:
 *
 *   • gross_goods / orders / units — this shop's lines on orders PAID in the bucket. `canceled`
 *     counts as paid here, because a cancelled order WAS paid: its money is returned through a
 *     refund row, which the refunds column picks up on the day it was issued (FR-032).
 *   • refunds — attributed to this shop and issued in the bucket. Two shapes:
 *       – an ITEM refund names lines, so the shop's share is the sum of ITS lines' amounts.
 *       – a CANCELLATION names no lines at all (it covers the whole order, delivery included), so
 *         the shop's share is its goods on that order, less anything already refunded from them.
 *         Floored at zero: a goodwill gesture larger than the goods must not read as negative sales.
 *       – goodwill and external refunds are NOT attributed to any shop. They have no lines, and they
 *         are Effy's gesture rather than this shop's goods; charging them to a shop's revenue would
 *         make a figure the shop cannot explain from anything it did.
 *     Only `submitted` and `succeeded` count — money on its way or gone. `submitting` may never
 *     leave, and `failed`/`refused` never did (055's state machine, read the way it was designed).
 *   • cant_supply / cancelled — read from `fulfillment_event`, which is append-only, rather than
 *     from `shop_fulfillment.status`, which the next transition overwrites. A rollup must be
 *     recomputable from facts that do not move.
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
    SELECT SUM(oi.line_subtotal_amount) AS gross,
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
                           SELECT COALESCE(SUM(oi.line_subtotal_amount), 0)
                             FROM public.order_item oi
                            WHERE oi.order_id = r.order_id AND oi.shop_id = $1::uuid
                         ) - (
                           SELECT COALESCE(SUM(rl2.amount), 0)
                             FROM public.refund_line rl2
                             JOIN public.refund r2 ON r2.id = rl2.refund_id
                             JOIN public.order_item oi2 ON oi2.id = rl2.order_item_id
                            WHERE r2.order_id = r.order_id
                              AND oi2.shop_id = $1::uuid
                              AND r2.status IN ('submitted', 'succeeded')
                         ))
                    ELSE (
                           SELECT COALESCE(SUM(rl.amount), 0)
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
 * Wipe the product rows for the local DATES the recomputed hours fall in.
 *
 * ⚠ A SEPARATE STATEMENT, AND IT HAS TO BE. The first draft did the delete in a data-modifying CTE
 * on the INSERT below — which reads correctly and is wrong: PostgreSQL runs the sub-statements of a
 * WITH concurrently, with the same snapshot, so the INSERT's unique index still sees the rows the
 * DELETE is removing and the whole statement dies on `shop_product_sales_day_pkey`. It only shows up
 * on the SECOND recompute of a day — which is every correction, every reconciliation and every
 * reversed refund — so the container tests are the only thing that could have caught it.
 *
 * The wipe is what lets a product DROP OUT of a day (its only order refunded away, or reassigned):
 * an upsert alone would leave yesterday's row standing with nothing left to justify it.
 */
const WIPE_PRODUCTS = `
DELETE FROM public.shop_product_sales_day p
 USING (
   SELECT DISTINCT (b.bucket_start AT TIME ZONE $3)::date AS local_date
     FROM unnest($2::timestamptz[]) AS b(bucket_start)
 ) d
 WHERE p.shop_id = $1::uuid AND p.local_date = d.local_date
`;

/** Product-level sales for the local DATES the recomputed hours fall in. */
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
       SUM(oi.line_subtotal_amount)
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

/**
 * One run: claim, recompute, clear, advance the watermark.
 *
 * ⚠ ALL FOUR IN ONE TRANSACTION, per run. The clear must not commit without the recompute, or a
 * correction is dropped silently — the figure stays wrong and the queue says there is nothing to do,
 * which is the worst of both.
 */
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

/**
 * Keep the CURRENT hour fresh for every shop that has had activity in it.
 *
 * ⚠ Without this, a shop whose last order was 40 minutes ago shows figures stamped 40 minutes old
 * and an operator cannot tell "nothing has sold since" from "the figures have stopped updating".
 * The dirty marks cover changes; this covers the passage of time.
 */
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
