/** What the completion page is looking at; extracted so the cart rule (clear only on a paid order) is testable. */
export type CompletionState = "receipt" | "abandoned" | "confirming"

/** The order fields this decision reads. Deliberately narrow — nothing else about an order matters. */
export type CompletionOrder = {
  status?: string | null
  paymentStatus?: string | null
} | null

/**
 * `redirectStatus` IS A hint, not the truth — it is a query parameter on a URL the shopper's browser
 * followed, so it can be edited, replayed or stale. It is read only to choose the words for an order
 * that is already known to be unpaid; it can never turn an unpaid order into a receipt, and it can
 * never turn a paid one into a failure.
 */
export function completionState(order: CompletionOrder, redirectStatus?: string): CompletionState {
  const paid = order?.paymentStatus === "succeeded" || order?.status === "paid"
  if (paid) return "receipt"
  if (redirectStatus === "failed" || redirectStatus === "canceled") return "abandoned"
  return "confirming"
}

/**
 * Whether this outcome may empty the shopper's basket.
 *
 * Only a paid order. Nothing was charged in any other state, so the basket is the shopper's only way
 * to try again — and the abandoned copy promises, in words, that it is still there.
 */
export function mayClearCart(state: CompletionState): boolean {
  return state === "receipt"
}
