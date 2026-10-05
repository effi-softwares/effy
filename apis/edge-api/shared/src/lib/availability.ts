/**
 * THE ONE RULE that decides whether a shopper can buy a product (054 FR-012, SC-012).
 *
 * Before 054 the rule was the literal `p.status = 'active'`, written by hand in fourteen places.
 * Adding stock meant changing the answer in every one, and a missed one would quietly sell
 * something the shop does not have — no error, no log line, no failing test.
 *
 * So: one definition, two forms — a SQL fragment for queries and a predicate for rows already in
 * memory. `availability.test.ts` runs one truth table through both, and
 * `storefront/src/availability.guard.test.ts` refuses a hand-written `status = 'active'` against
 * `public.product` in any shopper-facing service.
 *
 * ⚠ NOT A DATABASE VIEW OR FUNCTION, deliberately: a function is evaluated per row and defeats the
 * `(shop_id, status)` index the storefront read path depends on (029).
 */

/** The one `public.product.status` value that permits a sale. */
export const STATUS_ACTIVE = "active";

/** What a query MUST select for `purchasable` to be answerable from its rows. */
export const AVAILABILITY_COLUMNS = "status, stock_tracked, stock_on_hand";

/**
 * SQL deciding purchasability for a `public.product` row under `alias`.
 *
 * ⚠ Both terms are load-bearing: `status` is an operator's decision to stop selling; stock is a
 * fact about a shelf. ⚠ `NOT alias.stock_tracked` comes FIRST so an untracked product
 * short-circuits before its NULL count is consulted and the predicate can never go three-valued.
 */
export function availabilityPredicate(alias: string): string {
  return `${alias}.status = '${STATUS_ACTIVE}' AND (NOT ${alias}.stock_tracked OR ${alias}.stock_on_hand > 0)`;
}

/**
 * `availabilityPredicate`'s twin for a row in memory. `stockOnHand` is null exactly when the
 * product is untracked; a TRACKED product with no count fails closed.
 */
export function purchasable(status: string, stockTracked: boolean, stockOnHand: number | null): boolean {
  if (status !== STATUS_ACTIVE) return false;
  if (!stockTracked) return true;
  return stockOnHand !== null && stockOnHand > 0;
}

/**
 * "The shelf is empty" as distinct from "we stopped selling it" (054 FR-014): a shopper can wait
 * for the first and not for the second.
 */
export function outOfStock(status: string, stockTracked: boolean, stockOnHand: number | null): boolean {
  return status === STATUS_ACTIVE && stockTracked && (stockOnHand === null || stockOnHand <= 0);
}
