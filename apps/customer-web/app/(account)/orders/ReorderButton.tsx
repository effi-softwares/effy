"use client"

import { useState } from "react"

import { reorderPastOrder } from "@/lib/cart-actions"

/**
 * "Buy again" — a past order back in the cart (027 FR-034).
 *
 * A client island on an otherwise server-rendered page: the order list is a request-time server read and
 * stays that way, and only this button needs to be interactive.
 *
 * ⚠ The OUTCOME is announced, not just the action. Adding a subset silently is the one result the shopper
 * cannot detect for themselves — they would go to the cart believing they had reordered everything
 * (FR-035). The message carries counts only, never a shop (FR-062).
 */
export function ReorderButton({ orderId }: { orderId: string }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function reorder() {
    setBusy(true)
    setMessage(null)
    const result = await reorderPastOrder(orderId)
    setBusy(false)

    if (!result) {
      setMessage("We couldn’t reorder that just now.")
      return
    }
    const skipped = result.skipped.length
    if (result.cart.lines.length === 0 && skipped > 0) {
      setMessage("Nothing from that order is available right now.")
    } else if (skipped === 0) {
      setMessage("Added to your cart.")
    } else {
      setMessage(`Added to your cart. ${skipped} item${skipped === 1 ? "" : "s"} couldn’t be added.`)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void reorder()}
        className="text-sm font-medium hover:underline disabled:text-muted-foreground disabled:no-underline"
      >
        {busy ? "Adding…" : "Buy again"}
      </button>
      {message ? (
        <span role="status" className="text-xs text-muted-foreground">
          {message}
        </span>
      ) : null}
    </div>
  )
}
