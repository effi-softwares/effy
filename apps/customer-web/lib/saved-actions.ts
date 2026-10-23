"use client"

/**
 * Saved-items mutations.
 *
 * The one shape every mutation has, inherited from `cart-actions.ts`:
 *
 *  1. apply to the mirror (synchronously, so the control responds instantly)
 *  2. send to the platform
 *
 * In that order, always. A control that waits for the network before moving feels broken on a slow
 * connection, and one that moves without ever reverting lies about what was recorded.
 *
 * The client never learns whether the shopper is signed in. A `401` simply means "you are a guest"
 * — a normal state, not a failure — and the mirror is the whole truth for them until guest saving is
 * wired to the platform in US3. `cart-actions.ts` carries the same rule for the same reason.
 */
import { adoptSaved, applySaved, isInNamedList, isSaved, readSavedIds } from "./saved-store"

/** How many a device-held guest list may hold. Mirrors the saved-items guest cap on the server. */
export const GUEST_CAP = 50

async function send(path: string, method: "PUT" | "DELETE", body?: unknown): Promise<number> {
  try {
    const res = await fetch(path, body === undefined ? { method } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    return res.status
  } catch {
    return 0 // transient — the mirror keeps the shopper's intent
  }
}

/**
 * Toggle a product, optimistically. Takes the desired end state, not a flip, so rapid taps settle on the
 * last intent whatever order responses arrive in.
 *
 * Returns `false` when the guest cap refused it, and `"chooser"` when the product is in a list the shopper
 * named: one heart tap must never take it out of that list (the platform enforces the same rule, so a
 * stale mirror's `409` lands in the same place). `variantId` is the selected size, so "add to cart" from
 * the saved list adds it. Saved items stay one per product.
 */
export async function toggleSaved(productId: string, saved: boolean, variantId?: string | null): Promise<boolean | "chooser"> {
  const previous = isSaved(productId)
  if (previous === saved) return true // nothing to do, and nothing to revert if it fails
  if (!saved && isInNamedList(productId)) return "chooser"

  if (saved && readSavedIds().length >= GUEST_CAP) {
    // Refused, never resolved by evicting something the shopper deliberately saved.
    return false
  }

  applySaved(productId, saved)

  const status = saved
    ? await send(`/api/saved/${productId}`, "PUT", variantId ? { variantId } : undefined)
    : await send(`/api/saved/${productId}`, "DELETE")
  // 401 = guest. 0 = the request never left. Neither is a refusal of the shopper's intent, so the
  // mirror stands. Anything else in the 4xx/5xx range is the platform saying no.
  if (status >= 400 && status !== 401) {
    applySaved(productId, previous)
    // The only 409 an un-save can get is "this is in one of your lists".
    return !saved && status === 409 ? "chooser" : false
  }
  return true
}

/**
 * Seed the mirror from the platform.
 *
 * On failure the mirror is left alone rather than emptied. Emptying it would render every heart
 * unsaved, which invites exactly the destructive second tap this feature exists to remove — so a
 * failed refresh degrades to stale-but-plausible instead of confidently wrong.
 */
export async function refreshSaved(): Promise<void> {
  try {
    const res = await fetch("/api/saved/ids")
    if (!res.ok) return // 401 = guest; the local mirror is already their truth
    const body = (await res.json()) as { productIds: string[]; namedProductIds: string[] }
    adoptSaved(body.productIds, body.namedProductIds)
  } catch {
    /* transient — the next page load repairs it */
  }
}
