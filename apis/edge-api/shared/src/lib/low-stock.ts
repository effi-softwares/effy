// The low-stock rule in SQL, shared by the restock list, back-office and Today so they always agree.
// Callers alias `public.product_variant` as `v`, join `public.product` as `p`, and left join
// `public.shop_stock_settings` as `s`.

/** The variant's threshold if set, else the shop's default; null means no opinion about low. */
export const EFFECTIVE_LOW_STOCK_THRESHOLD = `COALESCE(v.low_stock_threshold, s.default_low_stock_threshold)`;

/** `out` and `low` are different problems; `low` excludes zero. */
export const LOW_STOCK_SEVERITY = `CASE WHEN v.stock_on_hand <= 0 THEN 'out' ELSE 'low' END`;

/**
 * Tracked, product not archived, variant not removed (inactive still counts), and empty or at/below
 * its effective threshold. No threshold anywhere: never low, but still reported at zero. Rides
 * `product_variant_low_stock_idx`.
 */
export const LOW_STOCK_PREDICATE = `v.stock_tracked
   AND v.state <> 'removed'
   AND p.status <> 'archived'
   AND (
         v.stock_on_hand <= 0
      OR (${EFFECTIVE_LOW_STOCK_THRESHOLD} IS NOT NULL
          AND v.stock_on_hand <= ${EFFECTIVE_LOW_STOCK_THRESHOLD})
       )`;
