// The low-stock rule — ONE definition, in SQL, shared by every service that asks the question (058,
// promoted from edge-api/inventory where 054 wrote it).
//
// ⚠ WHY THIS IS SHARED RATHER THAN RETYPED. 054's headline lesson was `p.status = 'active'` written
// by hand in 14 places: adding stock meant changing the answer in all of them, and missing one left
// a surface quietly selling what a shop did not have — no error, no log line, no failing test. The
// restock list, the back-office view and now Today's "needs attention" all answer "what is running
// out?", and if they answer differently the operator is simply told two things. A shared SQL
// fragment cannot drift; two copies of a CASE expression can, silently, because a SELECT never
// fails.
//
// Callers must alias `public.product` as `p` and LEFT JOIN `public.shop_stock_settings` as `s`.

/** The product's own threshold if set, else the shop's default. NULL = "no opinion about low". */
export const EFFECTIVE_LOW_STOCK_THRESHOLD = `COALESCE(p.low_stock_threshold, s.default_low_stock_threshold)`;

/**
 * ⚠ `out` and `low` are different problems, not one flag (054 FR-029): an empty shelf needs
 * restocking now, a thin one needs it soon. `low` therefore excludes zero.
 */
export const LOW_STOCK_SEVERITY = `CASE WHEN p.stock_on_hand <= 0 THEN 'out' ELSE 'low' END`;

/**
 * Tracked, not archived, and either empty or at/below its effective threshold.
 *
 * ⚠ A product with NO threshold anywhere is never "low", but IS reported at zero (054 FR-005a): a
 * missing threshold means "I have no opinion about running low", not "never tell me about this".
 *
 * Rides the partial index `product_low_stock_idx (shop_id, stock_on_hand) WHERE stock_tracked`.
 */
export const LOW_STOCK_PREDICATE = `p.stock_tracked
   AND p.status <> 'archived'
   AND (
         p.stock_on_hand <= 0
      OR (${EFFECTIVE_LOW_STOCK_THRESHOLD} IS NOT NULL
          AND p.stock_on_hand <= ${EFFECTIVE_LOW_STOCK_THRESHOLD})
       )`;
