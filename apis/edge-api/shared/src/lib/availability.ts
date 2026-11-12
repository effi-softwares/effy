/**
 * The one rule deciding whether a shopper can buy something. A variant is what is bought, so:
 *  variantPurchasableSql(p, v, except?) SQL for product `p` joined to variant `v` (cart, checkout)
 *  productAvailableSql(p, except?) SQL for a product alone: an exists over its variants (listings)
 *  purchasable(...) in memory, for a row read with variantAvailabilityColumns(...)
 * one truth table (`availability.test.ts`); `availability.guard.test.ts` refuses a hand-written
 * `status = 'active'` / `state = 'active'` or a hand-written stock comparison in shopper code. Not a database
 * function: that would defeat the storefront's indexes (the exists rides `product_variant_active_idx`).
 *
 * 114: a counted size's units **left to sell** are its shelf count minus other shoppers' live checkout holds
 * (`stockHeldSql`). A hold counts only while `held_until > now()`, so one that ran out stops counting by itself.
 * `except` names the shopper whose own holds are left out - always the CUSTOMER (cart, checkout, saved items,
 * `holdStock`, finalize), never the order: one shopper can briefly have two unpaid orders. Listings are shared
 * between shoppers and pass none.
 */

export const STATUS_ACTIVE = "active";

export const VARIANT_STATE_ACTIVE = "active";

/**
 * Units of variant `v` held for checkouts right now, as SQL (an integer, 0 when none). `exceptCustomer` is a SQL
 * expression naming a customer id (`$1`, `o.customer_id`) whose own holds are not counted. The only place this sum is
 * written: `@effy/edge-shared/stock` imports it too.
 */
export function stockHeldSql(v: string, exceptCustomer?: string): string {
  const mine = exceptCustomer ? ` AND sth.customer_id IS DISTINCT FROM ${exceptCustomer}` : "";
  return `COALESCE((SELECT sum(sth.quantity) FROM public.stock_hold sth WHERE sth.variant_id = ${v}.id AND sth.held_until > now()${mine}), 0)::int`;
}

/** Sold, and untracked or with units left to sell. */
function variantSellable(v: string, exceptCustomer?: string): string {
  // `NOT v.stock_tracked` first, so an untracked variant's null count (and any hold on it) is never consulted.
  return `${v}.state = '${VARIANT_STATE_ACTIVE}' AND (NOT ${v}.stock_tracked OR ${v}.stock_on_hand > ${stockHeldSql(v, exceptCustomer)})`;
}

/** `status` stops the product, `state` stops this variant, stock is a fact about a shelf less what checkouts hold. */
export function variantPurchasableSql(p: string, v: string, exceptCustomer?: string): string {
  return `${p}.status = '${STATUS_ACTIVE}' AND ${variantSellable(v, exceptCustomer)}`;
}

/** On sale, and some variant sellable. */
export function productAvailableSql(p: string, exceptCustomer?: string): string {
  return `${p}.status = '${STATUS_ACTIVE}' AND EXISTS (
        SELECT 1 FROM public.product_variant av
         WHERE av.product_id = ${p}.id AND ${variantSellable("av", exceptCustomer)})`;
}

/** What a query must select (aliases `p`, `v`) for `purchasable` to be answerable. */
export function variantAvailabilityColumns(exceptCustomer?: string): string {
  return (
    "p.status AS status, v.state AS variant_state, v.stock_tracked AS stock_tracked, v.stock_on_hand AS stock_on_hand, " +
    `${stockHeldSql("v", exceptCustomer)} AS stock_held`
  );
}

/** Units a shopper can still buy: the shelf less other shoppers' live holds, never below 0. null when uncounted (unlimited). */
export function leftToSell(stockTracked: boolean, stockOnHand: number | null, stockHeld: number): number | null {
  if (!stockTracked) return null;
  return Math.max(0, (stockOnHand ?? 0) - stockHeld);
}

/** `stockOnHand` is null exactly when untracked; a tracked variant with no count fails closed. */
export function purchasable(
  status: string,
  variantState: string,
  stockTracked: boolean,
  stockOnHand: number | null,
  stockHeld: number,
): boolean {
  if (status !== STATUS_ACTIVE || variantState !== VARIANT_STATE_ACTIVE) return false;
  if (!stockTracked) return true;
  return stockOnHand !== null && stockOnHand - stockHeld > 0;
}

/**
 * "Nothing left to buy", distinct from "we stopped selling it": a shopper can wait for the first. Units held by other
 * checkouts count as gone - the shopper is never told someone else holds them (114 FR-020).
 */
export function outOfStock(
  status: string,
  variantState: string,
  stockTracked: boolean,
  stockOnHand: number | null,
  stockHeld: number,
): boolean {
  return (
    status === STATUS_ACTIVE &&
    variantState === VARIANT_STATE_ACTIVE &&
    stockTracked &&
    (stockOnHand === null || stockOnHand - stockHeld <= 0)
  );
}
