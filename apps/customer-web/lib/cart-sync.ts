"use client"

/**
 * Keeps the cart mirror and the platform in agreement — 027, the web half of the same design as
 * `customer-mobile`'s `CartSyncCoordinator`.
 *
 * ── What it does now (US1) ──────────────────────────────────────────────────────────────────────
 *
 * Re-prices a restored cart. A shopper who closes the tab and comes back tomorrow must not be shown the
 * prices and availability their cart was built from — FR-004 says a restored cart shows CURRENT ones, and
 * that applies to a guest as much as to a signed-in shopper.
 *
 * The two paths differ only in which endpoint answers:
 *
 *   - **signed in** → `GET /api/cart` — the account cart IS the truth, adopted by revision.
 *   - **guest**     → `POST /api/cart/preview` — a guest has no server cart, so the platform prices the
 *                     browser's own lines and writes nothing.
 *
 * ⚠ A failure NEVER empties the cart. A dead network means "we could not check", not "you have nothing" —
 * a shopper losing their cart because a request timed out would be this slice's own defect arriving by a
 * different route. Every path here either adopts a platform answer or leaves the mirror exactly as it was.
 *
 * ⚠ It also cannot tell a guest from a signed-in shopper by itself, and deliberately does not try:
 * `/api/cart` answers 401 for a guest (the session is read server-side, inside the route handler, which is
 * what keeps `aws-amplify` out of this bundle). A 401 is therefore not an error here — it is the answer
 * "you are a guest", and it falls through to the preview path.
 *
 * US2 adds sending mutations and reconciling on focus; US4 adds the debounce, backoff and offline queue.
 * The seam is this shape now so those are additions, not a rewrite.
 */
import { CartApiError, cartApi } from "./cart-api"
import { adopt, adoptPreview, linePayload, readCart } from "./cart-store"

/**
 * Bring the mirror up to date. Safe to call on every cart open and every tab focus.
 *
 * Returns true when the mirror changed. A false means either nothing was newer or the platform could not
 * be reached — and the caller does not need to care, because either way the mirror is still the best
 * available answer and still what the UI shows.
 */
export async function refreshCart(): Promise<boolean> {
  try {
    return adopt(await cartApi.get())
  } catch (err) {
    // 401 = a guest, which is a normal state and not a failure. Anything else (offline, 502) also falls
    // through to the guest path, which is harmless: preview writes nothing and its own failure is caught.
    if (!(err instanceof CartApiError)) return false
    return refreshGuestCart()
  }
}

/** Re-price the browser's own lines without writing anything (the guest path). */
async function refreshGuestCart(): Promise<boolean> {
  const lines = readCart().lines
  // Nothing to price. Deliberately not a request: an empty guest cart is a common state and does not
  // deserve a round trip on every page open.
  if (lines.length === 0) return false
  try {
    adoptPreview(await cartApi.preview(linePayload(lines)))
    return true
  } catch {
    return false
  }
}
