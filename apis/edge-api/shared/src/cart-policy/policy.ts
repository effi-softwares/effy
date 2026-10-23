/**
 * The order rules: the minimum spend before checkout and the two cart ceilings. A table read, not a
 * constant, so the limit the shopper is told is the one enforced. The minimum is enforced again at
 * checkout. Written by back-office's order-rules screen.
 */
import type { Queryable } from "../lib/db";
import { CURRENCY, parseCents } from "../lib/money";

/** Only if the row were missing (the migration makes that impossible): a zero minimum never blocks checkout. */
export const DEFAULT_MAX_LINE_QUANTITY = 99;
export const DEFAULT_MAX_DISTINCT_ITEMS = 100;

/** Money is integer cents, formatted only at the wire. */
export interface CartPolicy {
  minimumSubtotalCents: number;
  currency: string;
  maxLineQuantity: number;
  maxDistinctItems: number;
}

/** When none is in force, the cart says nothing about one. */
export function hasMinimum(p: CartPolicy): boolean {
  return p.minimumSubtotalCents > 0;
}

/** In cents; 0 once met. */
export function remainingToMinimum(p: CartPolicy, payableCents: number): number {
  if (!hasMinimum(p) || payableCents >= p.minimumSubtotalCents) return 0;
  return p.minimumSubtotalCents - payableCents;
}

export function meetsMinimum(p: CartPolicy, payableCents: number): boolean {
  return remainingToMinimum(p, payableCents) === 0;
}

export function defaultCartPolicy(): CartPolicy {
  return {
    minimumSubtotalCents: 0,
    currency: CURRENCY,
    maxLineQuantity: DEFAULT_MAX_LINE_QUANTITY,
    maxDistinctItems: DEFAULT_MAX_DISTINCT_ITEMS,
  };
}

interface PolicyRow {
  minimum_subtotal_amount: string;
  currency: string;
  max_line_quantity: number;
  max_distinct_items: number;
}

/** A missing row falls back to the permissive default, so the cart stays readable. */
export async function loadCartPolicy(q: Queryable): Promise<CartPolicy> {
  const row = (
    await q.query<PolicyRow>(`
SELECT minimum_subtotal_amount::text AS minimum_subtotal_amount,
       currency                      AS currency,
       max_line_quantity             AS max_line_quantity,
       max_distinct_items            AS max_distinct_items
FROM public.order_policy
WHERE singleton`)
  ).rows[0];
  return row ? policyFromRow(row) : defaultCartPolicy();
}

export function policyFromRow(row: PolicyRow): CartPolicy {
  return {
    minimumSubtotalCents: parseCents(row.minimum_subtotal_amount),
    currency: row.currency,
    // The CHECKs bound these, but a nonsensical ceiling would clamp every quantity to 0 and empty carts.
    maxLineQuantity: row.max_line_quantity < 1 ? DEFAULT_MAX_LINE_QUANTITY : row.max_line_quantity,
    maxDistinctItems: row.max_distinct_items < 1 ? DEFAULT_MAX_DISTINCT_ITEMS : row.max_distinct_items,
  };
}
