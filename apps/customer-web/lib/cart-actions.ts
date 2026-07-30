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
 *     next `refreshCart()` reconciles it against the platform. The change itself is not retried on web:
 *     unlike mobile there is no persisted queue here, deliberately — a browser tab is a shorter-lived thing
 *     than an app, and a queue in `localStorage` would cost this storefront bundle bytes for a case the
 *     next cart open already repairs.
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

/**
 * Set a line's ABSOLUTE quantity; 0 removes it.
 *
 * ⚠ DEBOUNCED per product, unlike add. A stepper is clicked repeatedly and only the value the shopper
 * settles on matters, so ten clicks cost ONE request (FR-016, SC-005). Safe only because the payload is
 * absolute: dropping the intermediate values loses nothing, because the last one already says everything.
 * With increments it would corrupt the total — which is why 027 made quantities absolute.
 *
 * The mirror has already moved by the time the timer starts, so the debounce is invisible: the shopper
 * sees every click immediately and the network sees only the answer.
 */
const SEND_DEBOUNCE_MS = 400

interface PendingSend {
  timer: ReturnType<typeof setTimeout>
  fire: () => void
}

const pendingSends = new Map<string, PendingSend>()

export function setItemQuantity(productId: string, quantity: number): void {
  applySetQty(productId, quantity)

  pendingSends.get(productId)?.timer && clearTimeout(pendingSends.get(productId)!.timer)

  const fire = () => {
    pendingSends.delete(productId)
    // Minted HERE, not per click: one shopper action, one id — a retry of it must reuse the id (FR-018).
    const changeId = newChangeId()
    // ⚠ The value sent is the one the shopper CLICKED, captured above — not re-read from the mirror at fire
    // time. Re-reading looks equivalent and is not: a platform response adopted between the click and the
    // timer would rewrite what gets sent, and an adopted cart that no longer holds this line would turn
    // "set it to 4" into a delete the shopper never asked for. This matches mobile, where the queued change
    // carries its own quantity.
    void send(() =>
      quantity <= 0 ? cartApi.remove(productId, changeId) : cartApi.setQuantity(productId, quantity, changeId),
    )
  }

  pendingSends.set(productId, { timer: setTimeout(fire, SEND_DEBOUNCE_MS), fire })
}

/**
 * Send every debounced change NOW rather than waiting out its timer.
 *
 * ⚠ It fires them; it does not cancel them. Called when the shopper leaves the cart — a change they made a
 * quarter of a second before navigating away must not be dropped because a timer never got to run.
 */
export function flushPendingCartSends(): void {
  const inFlight = [...pendingSends.values()]
  pendingSends.clear()
  for (const p of inFlight) {
    clearTimeout(p.timer)
    p.fire()
  }
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
