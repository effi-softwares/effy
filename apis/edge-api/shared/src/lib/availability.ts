/**
 * THE ONE RULE that decides whether a shopper can buy something (054 FR-012, SC-012; 098 R5).
 *
 * Before 054 the rule was the literal `p.status = 'active'`, written by hand in fourteen places.
 * Adding stock meant changing the answer in every one, and a missed one would quietly sell
 * something the shop does not have — no error, no log line, no failing test.
 *
 * ⚠ 098 — WHAT IS BOUGHT IS A VARIANT. The rule therefore has a VARIANT form (cart and checkout
 * refuse per variant, because money moves on a variant) and a PRODUCT form (a listing projects or
 * filters per product: a product is available when ANY of its variants is). Three forms, one truth
 * table (`availability.test.ts`):
 *
 *   variantPurchasableSql(p, v)   SQL, a product row `p` joined to one of its variants `v`
 *   productAvailableSql(p)        SQL, a product row alone — an EXISTS over its variants
 *   purchasable(...)              in memory, for a row already read with VARIANT_AVAILABILITY_COLUMNS
 *
 * `storefront/src/availability.guard.test.ts` refuses a hand-written `status = 'active'` or
 * `state = 'active'` in any shopper-facing service.
 *
 * ⚠ NOT A DATABASE VIEW OR FUNCTION, deliberately: a function is evaluated per row and defeats the
 * indexes the storefront read path depends on (029). The EXISTS rides `product_variant_active_idx`.
 */

/** The one `public.product.status` value that permits a sale. */
export const STATUS_ACTIVE = "active";

/** The one `public.product_variant.state` value that permits a sale. */
export const VARIANT_STATE_ACTIVE = "active";

/**
 * What a query MUST select for `purchasable` to be answerable from its rows: the product's status and
 * the variant's state and stock, under the aliases `p` and `v`.
 */
export const VARIANT_AVAILABILITY_COLUMNS =
  "p.status AS status, v.state AS variant_state, v.stock_tracked AS stock_tracked, v.stock_on_hand AS stock_on_hand";

/** The variant half alone — sold, and untracked or with stock. */
function variantSellable(v: string): string {
  // ⚠ `NOT v.stock_tracked` comes FIRST so an untracked variant short-circuits before its NULL count
  // is consulted, and the predicate can never go three-valued.
  return `${v}.state = '${VARIANT_STATE_ACTIVE}' AND (NOT ${v}.stock_tracked OR ${v}.stock_on_hand > 0)`;
}

/**
 * SQL deciding whether variant `v` of product `p` can be bought now. Both terms are load-bearing:
 * `status` is an operator's decision to stop selling the product; `state` to stop selling this
 * variant; stock is a fact about a shelf.
 */
export function variantPurchasableSql(p: string, v: string): string {
  return `${p}.status = '${STATUS_ACTIVE}' AND ${variantSellable(v)}`;
}

/** SQL deciding whether product `p` can be bought at all: on sale, and some variant sellable. */
export function productAvailableSql(p: string): string {
  return `${p}.status = '${STATUS_ACTIVE}' AND EXISTS (
        SELECT 1 FROM public.product_variant av
         WHERE av.product_id = ${p}.id AND ${variantSellable("av")})`;
}

/**
 * The in-memory twin of `variantPurchasableSql`. `stockOnHand` is null exactly when the variant is
 * untracked; a TRACKED variant with no count fails closed.
 */
export function purchasable(status: string, variantState: string, stockTracked: boolean, stockOnHand: number | null): boolean {
  if (status !== STATUS_ACTIVE || variantState !== VARIANT_STATE_ACTIVE) return false;
  if (!stockTracked) return true;
  return stockOnHand !== null && stockOnHand > 0;
}

/**
 * "The shelf is empty" as distinct from "we stopped selling it" (054 FR-014): a shopper can wait
 * for the first and not for the second.
 */
export function outOfStock(status: string, variantState: string, stockTracked: boolean, stockOnHand: number | null): boolean {
  return status === STATUS_ACTIVE && variantState === VARIANT_STATE_ACTIVE && stockTracked && (stockOnHand === null || stockOnHand <= 0);
}
