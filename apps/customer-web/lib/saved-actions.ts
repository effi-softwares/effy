"use client"

/**
 * Saved-items mutations (033).
 *
 * ⚠ THE ONE SHAPE EVERY MUTATION HAS, inherited from `cart-actions.ts`:
 *
 *   1. apply to the mirror (synchronously, so the control responds instantly)
 *   2. send to the platform
 *
 * In that order, always. A control that waits for the network before moving feels broken on a slow
 * connection, and one that moves without ever reverting lies about what was recorded.
 *
 * ⚠ The client NEVER learns whether the shopper is signed in. A `401` simply means "you are a guest"
 * — a normal state, not a failure — and the mirror is the whole truth for them until guest saving is
 * wired to the platform in US3. `cart-actions.ts` carries the same rule for the same reason.
 */
import { adoptSaved, applySaved, isInNamedList, isSaved, readSavedIds } from "./saved-store"

/** How many a device-held guest list may hold (FR-046). Mirrors `saveditems.GuestCap` on the hot path. */
export const GUEST_CAP = 50


async function send(path: string, method: "PUT" | "DELETE"): Promise<number> {
  try {
    const res = await fetch(path, { method })
    return res.status
  } catch {
    return 0 // transient — the mirror keeps the shopper's intent
  }
}

/**
 * Toggle a product, optimistically.
 *
 * ⚠ Takes the DESIRED end state rather than "flip whatever is there". Under rapid tapping a flip
 * resolves against whatever the mirror held when the handler ran, so two fast taps can settle on the
 * wrong value; an absolute intent cannot (FR-014 — last intent wins, regardless of the order
 * responses arrive in).
 *
 * Returns `false` when the save was refused by the guest cap, so the caller can say why.
 *
 * ⚠ Returns `"chooser"` when the tap must OPEN THE LIST CHOOSER instead (068 FR-020): the product is
 * in a list the shopper named, and one tap on a heart must never take it out of that list. Nothing
 * is sent and nothing moves. The platform enforces the same rule, so a mirror that did not know
 * (`409`) lands in the same place after reverting.
 */
export async function toggleSaved(productId: string, saved: boolean): Promise<boolean | "chooser"> {
  const previous = isSaved(productId)
  if (previous === saved) return true // nothing to do, and nothing to revert if it fails
  if (!saved && isInNamedList(productId)) return "chooser"

  if (saved && readSavedIds().length >= GUEST_CAP) {
    // ⚠ Refused, never resolved by evicting something the shopper deliberately saved (FR-047).
    return false
  }

  applySaved(productId, saved)

  const status = await send(`/api/saved/${productId}`, saved ? "PUT" : "DELETE")
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
 * ⚠ On failure the mirror is LEFT ALONE rather than emptied. Emptying it would render every heart
 * unsaved, which invites exactly the destructive second tap this feature exists to remove — so a
 * failed refresh degrades to stale-but-plausible instead of confidently wrong.
 */
export async function refreshSaved(): Promise<void> {
  try {
    const res = await fetch("/api/saved/ids")
    if (!res.ok) return // 401 = guest; the local mirror is already their truth
    const body = (await res.json()) as { productIds?: string[]; namedProductIds?: string[] }
    // A backend from before 068 sends no `namedProductIds`; an empty set is the safe reading.
    if (Array.isArray(body.productIds)) adoptSaved(body.productIds, body.namedProductIds ?? [])
  } catch {
    /* transient — the next page load repairs it */
  }
}
