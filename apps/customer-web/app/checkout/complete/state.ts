/**
 * What the completion page is actually looking at (051).
 *
 * ⚠ EXTRACTED SO THE CART RULE CAN BE TESTED. The rule — clear the basket on a paid order, keep it on
 * every other outcome — lived inside JSX as an unconditional `<ClearCart>`, where nothing could assert
 * it and a defect survived review: an order that existed but had NOT been paid rendered as a receipt
 * and emptied the basket. See the note in `page.tsx`.
 */
export type CompletionState = "receipt" | "abandoned" | "confirming"

/** The order fields this decision reads. Deliberately narrow — nothing else about an order matters. */
export type CompletionOrder = {
  status?: string | null
  paymentStatus?: string | null
} | null

/**
 * ⚠ `redirectStatus` IS A HINT, NOT THE TRUTH — it is a query parameter on a URL the shopper's browser
 * followed, so it can be edited, replayed or stale. It is read ONLY to choose the words for an order
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
 * ⚠ ONLY a paid order. Nothing was charged in any other state, so the basket is the shopper's only way
 * to try again — and the abandoned copy promises, in words, that it is still there.
 */
export function mayClearCart(state: CompletionState): boolean {
  return state === "receipt"
}
