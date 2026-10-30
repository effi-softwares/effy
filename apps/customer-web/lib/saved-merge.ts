"use client"

/**
 * The guest → account join, and its disclosure.
 *
 * Its own module, for bytes. `SaveControl` imports `saved-actions`, and `saved-actions` is
 * therefore on `/` and `/product/[id]`. When this code lived there it pushed `/` to
 * exactly 174.0 KB against a 174 KB budget - zero headroom. Nothing here is needed by a tile: the
 * merge runs on the auth pages and the disclosure is read by the saved list, none of which are
 * budgeted routes. Keep it that way.
 */
import { adoptSaved, readSavedIds } from "./saved-store"

/** Where the join's disclosure waits until a surface can show it. */
export const MERGE_NOTICE_KEY = "effy:saved:merged"

/**
 * Read and clear the pending join disclosure.
 *
 * Returns 0 when there is nothing to say. It is read-once by design: telling the shopper twice that
 * items joined would imply it happened twice.
 */
export function takeMergeNotice(): number {
  try {
    const raw = window.sessionStorage.getItem(MERGE_NOTICE_KEY)
    if (!raw) return 0
    window.sessionStorage.removeItem(MERGE_NOTICE_KEY)
    return Number(raw) || 0
  } catch {
    return 0
  }
}

/* The guest → account join */

interface GuestEntry {
  productId: string
  savedPriceAmount: string | null
  savedCurrency: string | null
  savedAt: string
}

/**
 * Fold the device-held list into the account on sign-in. Idempotent; the local list is cleared only after
 * the platform acknowledges. Returns how many items joined, so the caller can say so on a shared device.
 */
async function adoptMembership(): Promise<void> {
  try {
    const res = await fetch("/api/saved/ids")
    if (!res.ok) return
    const body = (await res.json()) as { productIds?: string[]; namedProductIds?: string[] }
    if (Array.isArray(body.productIds)) adoptSaved(body.productIds, body.namedProductIds ?? [])
  } catch {
    /* transient - the platform still refuses a destructive tap */
  }
}

export async function mergeSavedAfterSignIn(): Promise<number> {
  const ids = readSavedIds()
  // Even an empty device list still calls through: the account's own saved items have to reach the
  // mirror, or every heart renders unsaved until the next page load.
  const items: GuestEntry[] = ids.map((productId) => ({
    productId,
    // null, not "0". The web store keeps ids only, so the device never observed a price - the
    // platform then uses the product's current price as the baseline instead of reporting the item as
    // having fallen from nothing.
    savedPriceAmount: null,
    savedCurrency: null,
    savedAt: new Date().toISOString(),
  }))

  try {
    const res = await fetch("/api/saved/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    })
    if (!res.ok) return 0
    const body = (await res.json()) as { added?: number; productIds?: string[] }
    if (Array.isArray(body.productIds)) adoptSaved(body.productIds)
    // The merge answer does not say which products are in named lists, and a shopper who
    // has just signed in may own several. Without this the first tap on one of those hearts would
    // flip off, be refused, and flip back. This runs on the auth pages, never the guest path.
    void adoptMembership()
    const added = body.added ?? 0
    // The join is disclosed, never silent. Parked in sessionStorage because sign-in
    // navigates away and an in-memory toast would not survive it - a shared device would otherwise
    // absorb the previous person's saves with nothing said. Read and cleared by the saved list.
    if (added > 0) {
      try {
        window.sessionStorage.setItem(MERGE_NOTICE_KEY, String(added))
      } catch {
        /* storage disabled - the disclosure is best-effort, the merge still happened */
      }
    }
    return added
  } catch {
    return 0 // transient - the device list stands and the next sign-in retries
  }
}
