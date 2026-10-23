// The listing summary on `public.product` and its one writer. Listings page by price with a keyset on
// (price, id), so the product carries:
//  list_price_amount the lowest customer price among active variants
//  list_compare_at_amount that variant's "was" price
//  price_varies active variants' prices differ → the storefront says "From"
// active, not in stock, so the stock deduction at payment never touches it. Every price or state
// change calls `refreshListing` in the same transaction (`catalog.guard.test.ts`).

import type { Queryable } from "../lib/db";
import { emitMetric, metricNamespace } from "../lib/metrics";

/** Call inside the writing transaction. */
export async function refreshListing(tx: Queryable, productId: string): Promise<void> {
  await tx.query(
    `UPDATE public.product p
        SET list_price_amount      = s.min_price,
            list_compare_at_amount = s.min_was,
            price_varies           = COALESCE(s.varies, false)
       FROM (SELECT $1::uuid AS product_id) k
       LEFT JOIN LATERAL (
            SELECT v.price_amount AS min_price,
                   v.compare_at_amount AS min_was,
                   (SELECT count(DISTINCT x.price_amount) > 1
                      FROM public.product_variant x
                     WHERE x.product_id = k.product_id AND x.state = 'active') AS varies
              FROM public.product_variant v
             WHERE v.product_id = k.product_id AND v.state = 'active' AND v.price_amount IS NOT NULL
             ORDER BY v.price_amount, v.position
             LIMIT 1
       ) s ON true
      WHERE p.id = k.product_id`,
    [productId],
  );
  emitMetric(metricNamespace(), "ListingRefreshed", 1);
}
