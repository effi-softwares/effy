// The listing summary on `public.product` (098, research R4) — and its ONE writer.
//
// A listing sorts, filters and pages by price with a keyset on (price, id). A variant aggregate per
// row would defeat that index and put 029's timeout back, so the product carries a summary:
//   list_price_amount       the lowest CUSTOMER price among ACTIVE variants
//   list_compare_at_amount  that variant's "was" price
//   price_varies            active variants' prices differ → the storefront says "From"
//
// ⚠ ACTIVE, NOT IN-STOCK (spec FR-013): selling out never moves the summary, so the stock deduction at
// payment — the hottest write on the platform — never touches it. Prices and states change only at
// approval, on a margin change and through the variant state route, and every one of those calls
// `refreshListing` in the same transaction. `catalog.guard.test.ts` fails any other writer.

import type { Queryable } from "../lib/db";
import { emitMetric, metricNamespace } from "../lib/metrics";

/** Recompute product `productId`'s listing summary from its variants. Call inside the writing transaction. */
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
  // How often listings are recomputed (approval, margin, a size on or off sale) — never per sale.
  emitMetric(metricNamespace(), "ListingRefreshed", 1);
}
