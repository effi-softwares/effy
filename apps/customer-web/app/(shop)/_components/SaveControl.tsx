"use client"

import { Heart } from "lucide-react"
import { useState } from "react"

import { toggleSaved } from "@/lib/saved-actions"
import { useSavedIds } from "@/lib/saved-store"

/**
 * The heart (033). One toggle, used on product tiles and on product detail.
 *
 * ⚠ IT READS THE SHARED MIRROR. The predecessor opened with `useState(false)` and a comment saying
 * "a full is-favorited read is US6, so the initial state is unsaved" — which meant an already-saved
 * product showed an empty heart, the first tap was a no-op, and the SECOND silently un-saved it.
 * Subscribing to the store is what makes it truthful on first render (FR-019) and what keeps two
 * controls for the same product in step (FR-013).
 *
 * ⚠ ACCESSIBILITY (FR-058). The accessible NAME never changes — always "Save to saved items" — and
 * the state travels separately in `aria-pressed`. The predecessor swapped `aria-label` AND set
 * `aria-pressed`, which double-announces; MDN and Deque are explicit that the name stays put and only
 * the pressed state flips.
 *
 * ⚠ COLOUR CANNOT CARRY THIS (SC-009). The brand is monochrome with no hue, so a filled heart has no
 * colour cue distinguishing it from an outlined one — fill, shape and the announced state carry the
 * whole burden. That is a real risk, not a formality, and it is why SC-009 is an observer test.
 *
 * ⚠ Quarantine-safe: it never reads the session, so `aws-amplify` stays off the public path. A `401`
 * from the proxy simply means "you are a guest" and the device-local mirror is their truth.
 *
 * ⚠ The glyph is `lucide-react`, and inline SVG was TRIED and MEASURED WORSE (+0.1 KB on /search):
 * lucide is already in the guest chunk for other icons and tree-shakes to less than this path's own
 * data. Recorded so the "obvious" optimisation is not attempted a third time.
 */
export function SaveControl({
  productId,
  className = "",
}: {
  productId: string
  className?: string
}) {
  const savedIds = useSavedIds()
  const saved = savedIds.includes(productId)
  const [busy, setBusy] = useState(false)

  async function onToggle() {
    if (busy) return
    setBusy(true)
    // The store is updated inside `toggleSaved` BEFORE the request goes out, so the control moves
    // immediately and reverts only if the platform actually refuses.
    await toggleSaved(productId, !saved)
    setBusy(false)
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      // ⚠ Stable name + separate state. Do not move the state into the label.
      aria-label="Save to saved items"
      aria-pressed={saved}
      className={`inline-flex size-9 items-center justify-center rounded-full bg-card/80 backdrop-blur-sm transition hover:bg-card disabled:opacity-60 ${className}`}
    >
      <Heart className={saved ? "size-5 fill-current" : "size-5"} aria-hidden="true" />
    </button>
  )
}
