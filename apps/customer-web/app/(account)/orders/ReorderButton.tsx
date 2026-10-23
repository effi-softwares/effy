"use client"

import { useState } from "react"
import { RefreshCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { reorderPastOrder } from "@/lib/cart-actions"

/** Buy again: puts a past order's items back in the cart, and says what did not go in. */
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
      <Button type="button" variant="outline" disabled={busy} onClick={() => void reorder()}>
        <RefreshCcw aria-hidden="true" />
        {busy ? "Adding…" : "Buy again"}
      </Button>
      {message ? (
        <span role="status" className="text-xs text-muted-foreground">
          {message}
        </span>
      ) : null}
    </div>
  )
}
