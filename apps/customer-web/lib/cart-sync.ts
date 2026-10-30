"use client"

/**
 * Keeps the cart mirror and the platform in agreement (the web half of the app's
 * `CartSyncCoordinator`). A restored cart is re-priced, so it shows current prices and availability:
 * signed in, `GET /api/cart` (the account cart, adopted by revision); a guest, `POST /api/cart/preview`
 * (the platform prices the browser's lines and writes nothing). `/api/cart` answers 401 for a guest, which
 * falls through to the preview.
 *
 * A failure never empties the cart: every path adopts a platform answer or leaves the mirror as it was.
 */
import { CartApiError, cartApi } from "./cart-api"
import { adopt, adoptPreview, linePayload, readCart } from "./cart-store"

/**
 * Bring the mirror up to date. Safe to call on every cart open and every tab focus.
 *
 * Returns true when the mirror changed. A false means either nothing was newer or the platform could not
 * be reached - and the caller does not need to care, because either way the mirror is still the best
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
