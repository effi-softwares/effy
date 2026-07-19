"use client"

import { Heart } from "lucide-react"
import { useState } from "react"

/**
 * Save/un-save a product (US2). Quarantine-safe: it does NOT read the session (which would drag the
 * Amplify SDK into the public tree). It optimistically calls the authenticated `/api/favorites` proxy;
 * a 401 means "guest" → deferred sign-in (return-to-intent via `?next=`), then the customer is back
 * here. A full "is-favorited" read is US6, so the initial state is unsaved.
 */
export function FavoriteButton({ productId }: { productId: string }) {
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  async function toggle() {
    setBusy(true)
    try {
      const res = await fetch(`/api/favorites/${productId}`, { method: saved ? "DELETE" : "PUT" })
      if (res.status === 401) {
        const next = encodeURIComponent(window.location.pathname + window.location.search)
        window.location.href = `/sign-in?next=${next}`
        return
      }
      if (res.ok) setSaved((s) => !s)
    } catch {
      /* transient — leave state unchanged */
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? "Remove from favourites" : "Save to favourites"}
      className="inline-flex h-11 items-center gap-2 rounded-md border px-4 text-sm font-medium hover:bg-accent disabled:opacity-50"
    >
      <Heart className={saved ? "size-4 fill-current text-primary" : "size-4"} />
      {saved ? "Saved" : "Save"}
    </button>
  )
}
