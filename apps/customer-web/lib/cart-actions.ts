"use client"

/**
 * The cart's actions — 027, the web counterpart of `customer-mobile`'s cart use cases.
 *
 * ── The one shape every mutation has ────────────────────────────────────────────────────────────
 *
 *      1. apply to the mirror     — synchronous, so the click lands immediately (FR-014)
 *      2. send to the platform    — so the change is on the ACCOUNT and reaches the shopper's other devices
 *
 * In that order, always. Reversing them makes the UI wait on a network call before it moves, which is the
 * whole thing this design exists to avoid.
 *
 * ⚠ How this knows whether the shopper is signed in: it doesn't, and deliberately doesn't try. The session
 * is read server-side inside the route handlers — that is what keeps `aws-amplify` out of the storefront
 * bundle (011 FR-006) — so the client only learns the answer from the response. A **401 means "you are a
 * guest"**, which is a normal state, not a failure: the mirror keeps the change and the whole cart crosses
 * over once at sign-in via [mergeCartAfterSignIn].
 *
 * ⚠ Each mutation mints ONE `changeId` per shopper action. A retry would reuse it, so a request that
 * arrived without its response reaching us cannot apply twice (FR-018).
 */
import { CartApiError, cartApi, newChangeId } from "./cart-api"
import {
  addToCart as applyAdd,
  adopt,
  clearCart as applyClear,
  linePayload,
  readCart,
  removeFromCart as applyRemove,
  setCartQty as applySetQty,
  type GuestCartLine,
} from "./cart-store"

/**
 * Send a mutation and adopt the platform's answer.
 *
 * Swallows failures on purpose, and the two cases are different:
 *   - **401** — a guest. Nothing to do; the mirror is already correct for them.
 *   - **anything else** — offline, or the platform refused. The mirror keeps what the shopper did, and the
 *     next `refreshCart()` reconciles. US4 adds the queue that makes this survive a closed tab, and the
 *     visible "not saved yet" state; today an offline change is kept in the mirror but is not retried.
 */
async function send(call: () => Promise<Awaited<ReturnType<typeof cartApi.get>>>): Promise<void> {
  try {
    adopt(await call())
  } catch (err) {
    if (err instanceof CartApiError && err.status === 401) return
    // Deliberately silent: the shopper's cart is unchanged and still theirs.
  }
}

/** Add or increment a line. */
export function addItem(line: GuestCartLine): void {
  applyAdd(line)
  void send(() => cartApi.add(line.productId, line.quantity, newChangeId()))
}

/** Set a line's ABSOLUTE quantity; 0 removes it. */
export function setItemQuantity(productId: string, quantity: number): void {
  applySetQty(productId, quantity)
  const changeId = newChangeId()
  void send(() =>
    quantity <= 0 ? cartApi.remove(productId, changeId) : cartApi.setQuantity(productId, quantity, changeId),
  )
}

/** Remove a line. */
export function removeItem(productId: string): void {
  applyRemove(productId)
  void send(() => cartApi.remove(productId, newChangeId()))
}

/** Empty the payable cart. Set-aside items survive (FR-030/FR-032). */
export function clearAll(): void {
  applyClear()
  void send(() => cartApi.clear(newChangeId()))
}

/**
 * Fold this browser's cart into the account cart, immediately after sign-in (FR-011/FR-012).
 *
 * Union with MAXIMUM quantity, so nothing is lost from either side and running it twice changes nothing —
 * which is what makes it safe to call on every sign-in without tracking whether it already ran.
 *
 * ⚠ The local lines are never cleared first. They are replaced by the adopted account cart, which already
 * contains them; clearing first and merging second is how 019's Option B lost carts.
 */
export async function mergeCartAfterSignIn(): Promise<boolean> {
  const lines = readCart().lines
  try {
    if (lines.length === 0) {
      // Nothing of our own to contribute — but the ACCOUNT cart must still be adopted, or a shopper signing
      // in on a fresh browser sees an empty cart while the platform holds theirs.
      return adopt(await cartApi.get())
    }
    return adopt(await cartApi.merge(linePayload(lines), newChangeId()))
  } catch {
    // The merge retries on the next cart open. The device cart is untouched, so nothing is lost.
    return false
  }
}
