"use client"

import { Heart } from "lucide-react"
import { useState } from "react"

import { toggleSaved } from "@/lib/saved-actions"
import { useSavedIds } from "@/lib/saved-store"
import { toast } from "@/lib/toast-store"

/**
 * Loaded on demand, never imported. This control is on `/` and `/product/[id]`, and `/` had
 * 0.3 KB of guest budget left when lists arrived. The chooser costs nothing until someone opens it.
 */
const openChooser = (productId: string, variantId?: string | null) =>
  void import("./ListChooser").then((m) => m.openListChooser(productId, undefined, variantId))

/**
 * The heart, on tiles and product detail. It reads the shared mirror, so it is right on first render and
 * two hearts for one product agree. The accessible name never changes ("Save to saved items"); the state
 * is `aria-pressed`. Fill and shape carry the state (no hue). It never reads the session, keeping
 * `aws-amplify` off the public path; a 401 means a guest, whose device mirror is their truth. The glyph
 * is `lucide-react` (inline SVG measured larger).
 */
export function SaveControl({
  productId,
  variantId,
  className = "",
  label = false,
}: {
  productId: string
  /** The size on screen, remembered with the save (the product page passes it; a tile does not). */
  variantId?: string | null
  className?: string
  /** The product page's wide "Save" button; on a card the control is the heart alone. */
  label?: boolean
}) {
  const savedIds = useSavedIds()
  const saved = savedIds.includes(productId)
  const [busy, setBusy] = useState(false)

  async function onToggle() {
    if (busy) return
    setBusy(true)
    // The store is updated inside `toggleSaved` before the request goes out, so the control moves
    // immediately and reverts only if the platform actually refuses.
    const result = await toggleSaved(productId, !saved, variantId)
    setBusy(false)
    // A product in a list the shopper named is never un-saved by this tap.
    if (result === "chooser") openChooser(productId, variantId)
    // The save has already happened, in one tap. The other lists are an offer after it.
    else if (result && !saved) {
      toast("Saved", { action: { label: "Add to a list", run: () => openChooser(productId, variantId) } })
    }
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      // Stable name + separate state. Do not move the state into the label.
      aria-label="Save to saved items"
      aria-pressed={saved}
      className={`inline-flex items-center justify-center gap-2 rounded-md border bg-background text-sm font-medium shadow-xs transition hover:bg-accent disabled:opacity-60 ${label ? "h-10 border-input px-4" : "size-8"} ${saved ? "text-primary" : ""} ${className}`}
    >
      <Heart className={saved ? "size-4 fill-current" : "size-4"} aria-hidden="true" />
      {label && (saved ? "Saved" : "Save")}
    </button>
  )
}
