// Catches a writer that changed a figure without marking its bucket dirty. The count matters more than
// the repair: non-zero means the marking path has a hole to close.
import { query } from "@effy/edge-shared";

/** 35 days covers the longest range plus its comparison. */
export const RECONCILE_DAYS = 35;

export interface ReconcileResult {
  shops: number;
  bucketsChecked: number;
  /** Should be zero. */
  corrections: number;
  /** Rebuilt in full because their timezone moved. */
  timezoneRebuilds: number;
}

/** Every bucket boundary moves with the timezone, so the window is rebuilt. */
const TIMEZONE_DRIFTED = `
SELECT s.id::text AS shop_id, s.timezone
  FROM public.shop s
  LEFT JOIN public.insights_state st ON st.shop_id = s.id
 WHERE st.shop_id IS NULL OR st.timezone <> s.timezone
`;

/** The ordinary rollup path then recomputes. */
const MARK_WINDOW = `
INSERT INTO public.insights_dirty (shop_id, bucket_start)
SELECT $1::uuid, public.shop_local_hour(h, $2)
  FROM generate_series(now() - make_interval(days => $3::int), now(), interval '1 hour') AS h
ON CONFLICT DO NOTHING
`;

/** Counts disagreeing buckets and marks them dirty, so there is one recomputation rule. */
const COUNT_DIVERGENT = `
WITH expected AS (
  SELECT public.shop_local_hour(COALESCE(o.placed_at, o.created_at), $2) AS bucket_start,
         SUM(oi.shop_line_subtotal_amount) AS gross
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
