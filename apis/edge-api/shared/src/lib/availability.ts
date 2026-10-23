/**
 * The one rule deciding whether a shopper can buy something. A variant is what is bought, so:
 *  variantPurchasableSql(p, v) SQL for product `p` joined to variant `v` (cart, checkout)
 *  productAvailableSql(p) SQL for a product alone: an exists over its variants (listings)
 *  purchasable(...) in memory, for a row read with VARIANT_AVAILABILITY_COLUMNS
 * one truth table (`availability.test.ts`); `availability.guard.test.ts` refuses a hand-written
 * `status = 'active'` / `state = 'active'` in shopper code. Not a database function: that would defeat
 * the storefront's indexes (the exists rides `product_variant_active_idx`).
 */

export const STATUS_ACTIVE = "active";

export const VARIANT_STATE_ACTIVE = "active";

/** What a query must select (aliases `p`, `v`) for `purchasable` to be answerable. */
export const VARIANT_AVAILABILITY_COLUMNS =
  "p.status AS status, v.state AS variant_state, v.stock_tracked AS stock_tracked, v.stock_on_hand AS stock_on_hand";

/** Sold, and untracked or with stock. */
function variantSellable(v: string): string {
  // `NOT v.stock_tracked` first, so an untracked variant's null count is never consulted.
  return `${v}.state = '${VARIANT_STATE_ACTIVE}' AND (NOT ${v}.stock_tracked OR ${v}.stock_on_hand > 0)`;
}

/** `status` stops the product, `state` stops this variant, stock is a fact about a shelf. */
export function variantPurchasableSql(p: string, v: string): string {
  return `${p}.status = '${STATUS_ACTIVE}' AND ${variantSellable(v)}`;
}

/** On sale, and some variant sellable. */
export function productAvailableSql(p: string): string {
  return `${p}.status = '${STATUS_ACTIVE}' AND EXISTS (
        SELECT 1 FROM public.product_variant av
         WHERE av.product_id = ${p}.id AND ${variantSellable("av")})`;
}

/** `stockOnHand` is null exactly when untracked; a tracked variant with no count fails closed. */
export function purchasable(status: string, variantState: string, stockTracked: boolean, stockOnHand: number | null): boolean {
  if (status !== STATUS_ACTIVE || variantState !== VARIANT_STATE_ACTIVE) return false;
  if (!stockTracked) return true;
  return stockOnHand !== null && stockOnHand > 0;
}

/** "The shelf is empty", distinct from "we stopped selling it": a shopper can wait for the first. */
export function outOfStock(status: string, variantState: string, stockTracked: boolean, stockOnHand: number | null): boolean {
  return status === STATUS_ACTIVE && variantState === VARIANT_STATE_ACTIVE && stockTracked && (stockOnHand === null || stockOnHand <= 0);
}
