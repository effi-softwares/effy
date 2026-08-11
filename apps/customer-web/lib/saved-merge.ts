"use client"

/**
 * The guest → account join, and its disclosure (033 FR-028/FR-032).
 *
 * ⚠ ITS OWN MODULE, FOR BYTES. `SaveControl` imports `saved-actions`, and `saved-actions` is
 * therefore on `/` and `/product/[id]`. When this code lived there it pushed `/` to
 * exactly 174.0 KB against a 174 KB budget — zero headroom. Nothing here is needed by a tile: the
 * merge runs on the auth pages and the disclosure is read by the saved list, none of which are
 * budgeted routes. Keep it that way.
 */
import { adoptSaved, readSavedIds } from "./saved-store"

/** Where the join's disclosure waits until a surface can show it (FR-032). */
export const MERGE_NOTICE_KEY = "effy:saved:merged"

/**
 * Read and clear the pending join disclosure.
 *
 * ⚠ Returns 0 when there is nothing to say. It is read-once by design: telling the shopper twice that
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

/* ── The guest → account join (FR-028) ─────────────────────────────────────────────────────────── */

interface GuestEntry {
  productId: string
  savedPriceAmount: string | null
  savedCurrency: string | null
  savedAt: string
}

/**
 * Fold the device-held list into the account on sign-in.
 *
 * ⚠ THE LOCAL LIST IS CLEARED ONLY AFTER THE PLATFORM ACKNOWLEDGES. `cart-actions.ts` records why in
 * one line: "clearing first and merging second is how 019's Option B lost carts."
 *
 * ⚠ Idempotent, so it is safe on EVERY sign-in — including a repeat on a device that already merged.
 *
 * Returns how many items joined, so the caller can DISCLOSE it (FR-032) rather than silently
 * absorbing someone else's saves on a shared device.
 */
export async function mergeSavedAfterSignIn(): Promise<number> {
  const ids = readSavedIds()
  // ⚠ Even an EMPTY device list still calls through: the account's own saved items have to reach the
  // mirror, or every heart renders unsaved until the next page load.
  const items: GuestEntry[] = ids.map((productId) => ({
    productId,
    // ⚠ null, not "0". The web store keeps ids only, so the device never observed a price — the
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
    const added = body.added ?? 0
    // ⚠ FR-032: the join is DISCLOSED, never silent. Parked in sessionStorage because sign-in
    // navigates away and an in-memory toast would not survive it — a shared device would otherwise
    // absorb the previous person's saves with nothing said. Read and cleared by the saved list.
    if (added > 0) {
      try {
        window.sessionStorage.setItem(MERGE_NOTICE_KEY, String(added))
      } catch {
        /* storage disabled — the disclosure is best-effort, the merge still happened */
      }
    }
    return added
  } catch {
    return 0 // transient — the device list stands and the next sign-in retries
  }
}
