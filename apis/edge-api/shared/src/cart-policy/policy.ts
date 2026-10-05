/**
 * The platform's order rules — the minimum spend a cart must reach before checkout is allowed, and
 * the two ceilings a cart is held to (027 FR-053, FR-037, FR-038).
 *
 * ── Why this is a table read and not a constant ───────────────────────────────────────────────────
 *
 * The shopper must be TOLD the ceiling when they hit it, so the number has to reach the client.
 * Serving the limit from the same row the platform enforces it from removes the one failure that
 * matters here — a message and a rule that disagree.
 *
 * The minimum has a second requirement: it is enforced at checkout too, where the amount is
 * decided, so a client that ignores the cart's `checkout.allowed` cannot bypass it (FR-056).
 *
 * The row is written by the back-office order-rules screen (edge `admin`) and read here.
 */
import type { Queryable } from "../lib/db";
import { CURRENCY, parseCents } from "../lib/money";

/**
 * Used only when the policy row is missing, which the migration makes impossible (it seeds the row
 * and the table's `singleton` primary key forbids a second). They exist so a cart read degrades
 * rather than fails: a zero minimum means "no minimum in force" — a missing policy must never
 * block a shopper from checking out.
 */
export const DEFAULT_MAX_LINE_QUANTITY = 99;
export const DEFAULT_MAX_DISTINCT_ITEMS = 100;

/** The resolved order rules. Money is integer cents, formatted only at the wire. */
export interface CartPolicy {
  minimumSubtotalCents: number;
  currency: string;
  maxLineQuantity: number;
  maxDistinctItems: number;
}

/** Whether a minimum is in force at all. When it is not, the cart says nothing about one (FR-057). */
export function hasMinimum(p: CartPolicy): boolean {
  return p.minimumSubtotalCents > 0;
}

/** How much more a payable subtotal needs to reach the minimum, in cents; 0 once met. */
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

/**
 * Read the single order-rules row. A missing row falls back to the default rather than erroring:
 * the cart must stay readable, and the fallback is the permissive direction for the minimum.
 */
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
    // Defensive: the table's CHECKs already bound these, but a nonsensical ceiling would clamp
    // every quantity to 0 and silently empty carts. Refuse to believe it.
    maxLineQuantity: row.max_line_quantity < 1 ? DEFAULT_MAX_LINE_QUANTITY : row.max_line_quantity,
    maxDistinctItems: row.max_distinct_items < 1 ? DEFAULT_MAX_DISTINCT_ITEMS : row.max_distinct_items,
  };
}
