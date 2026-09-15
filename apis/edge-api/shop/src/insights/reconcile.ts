// The nightly reconciliation (058, US3).
//
// ⚠ IT EXISTS TO CATCH THE ONE THING THE DESIGN CANNOT PROVE: a writer that changed a figure without
// its bucket being marked dirty. The triggers make that very hard — they fire inside the writing
// transaction and cannot be forgotten by a service — but "very hard" is not "impossible", and the
// failure is silent: a wrong number that nobody can distinguish from a right one.
//
// Shopify's own reports carry a "data may be delayed" indicator rather than pretending; Stripe's
// webhook guidance is blunter — "your app shouldn't rely on receiving data … use reconciliation jobs"
// (docs/insights-architecture.md §3). This is that job, and what makes it useful is not the repair
// but the COUNT: a non-zero correction count is an alarm, because it means the marking path has a
// hole in it that the next slice should close rather than paper over nightly.
import { query } from "@effy/edge-shared";

/** How far back a nightly sweep rebuilds. 35 days covers the longest range plus its comparison. */
export const RECONCILE_DAYS = 35;

export interface ReconcileResult {
  shops: number;
  bucketsChecked: number;
  /** Buckets whose recomputed figures differed from what was stored. Should be zero. */
  corrections: number;
  /** Shops rebuilt in full because their timezone moved under the rollups. */
  timezoneRebuilds: number;
}

/**
 * A shop whose `shop.timezone` no longer matches what its rollups were built under.
 *
 * ⚠ EVERY BUCKET BOUNDARY MOVES WHEN A TIMEZONE DOES, so the existing rows are not stale — they are
 * addressed by keys that no longer mean anything. Rebuilding the window is the only correct answer;
 * leaving them would mix two eras of buckets in one chart, which reads as a sudden change in trade.
 */
const TIMEZONE_DRIFTED = `
SELECT s.id::text AS shop_id, s.timezone
  FROM public.shop s
  LEFT JOIN public.insights_state st ON st.shop_id = s.id
 WHERE st.shop_id IS NULL OR st.timezone <> s.timezone
`;

/** Mark every hour in the window dirty, so the ordinary rollup path does the recomputation. */
const MARK_WINDOW = `
INSERT INTO public.insights_dirty (shop_id, bucket_start)
SELECT $1::uuid, public.shop_local_hour(h, $2)
  FROM generate_series(now() - make_interval(days => $3::int), now(), interval '1 hour') AS h
ON CONFLICT DO NOTHING
`;

/**
 * Compare stored figures against a fresh computation, for one shop's window.
 *
 * Returns how many buckets disagreed. It does not repair them itself — marking them dirty and
 * letting the ordinary job recompute keeps ONE recomputation rule in the system rather than two that
 * can drift (which is the very failure this job exists to detect).
 */
const COUNT_DIVERGENT = `
WITH expected AS (
  SELECT public.shop_local_hour(COALESCE(o.placed_at, o.created_at), $2) AS bucket_start,
         SUM(oi.line_subtotal_amount) AS gross
    FROM public."order" o
    JOIN public.order_item oi ON oi.order_id = o.id AND oi.shop_id = $1::uuid
   WHERE o.status IN ('paid', 'canceled')
     AND COALESCE(o.placed_at, o.created_at) >= now() - make_interval(days => $3::int)
   GROUP BY 1
)
SELECT COUNT(*)::int AS divergent
  FROM expected e
  LEFT JOIN public.shop_sales_hour s
    ON s.shop_id = $1::uuid AND s.bucket_start = e.bucket_start
 WHERE COALESCE(s.gross_goods, 0) <> e.gross
`;

export async function runReconcile(days = RECONCILE_DAYS): Promise<ReconcileResult> {
  const shops = await query<{ shop_id: string; timezone: string }>(
    `SELECT s.id::text AS shop_id, s.timezone FROM public.shop s WHERE s.status = 'active'`,
    [],
  );
  const drifted = await query<{ shop_id: string; timezone: string }>(TIMEZONE_DRIFTED, []);
  const driftedIds = new Set(drifted.rows.map((r) => r.shop_id));

  let corrections = 0;
  let bucketsChecked = 0;

  for (const shop of shops.rows) {
    const divergent = await query<{ divergent: number }>(COUNT_DIVERGENT, [
      shop.shop_id,
      shop.timezone,
      days,
    ]);
    const n = divergent.rows[0]?.divergent ?? 0;
    bucketsChecked += 1;

    if (n > 0 || driftedIds.has(shop.shop_id)) {
      corrections += n;
      await query(MARK_WINDOW, [shop.shop_id, shop.timezone, days]);
    }
  }

  return {
    shops: shops.rows.length,
    bucketsChecked,
    corrections,
    timezoneRebuilds: driftedIds.size,
  };
}
