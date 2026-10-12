"use client"

import { useRouter } from "next/navigation"
import { useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"

/**
 * Cancel an order the shopper may still cancel (055 FR-012; reference: Orders · Cancel order).
 *
 * ⚠ SHOWN ONLY WHILE `cancellable` IS TRUE, and that is the server's word. It is also only advice:
 * a shop may have started picking since the page loaded, and the server decides again when the cancel
 * arrives. A refusal is shown HERE, in the question that was asked.
 *
 * ⚠ THE QUESTION NAMES WHAT HAPPENS — everything refunded, delivery included — rather than asking
 * "are you sure?", which tells nobody anything.
 */
export function CancelOrder({ orderId }: { orderId: string }) {
  const router = useRouter()
  const dialog = useRef<HTMLDialogElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function cancel() {
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/orders/${orderId}/cancel`, { method: "POST" })
    setBusy(false)
    if (res.ok) {
      dialog.current?.close()
      router.refresh()
      return
    }
    if (res.status === 401) {
      router.push(`/sign-in?next=/orders/${orderId}`)
      return
    }
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    setError(body?.error ?? "We couldn’t cancel that just now. Please contact us.")
  }

  return (
    <>
      <Button type="button" variant="ghost" onClick={() => dialog.current?.showModal()}>
        Cancel this order
      </Button>
      <Dialog
        ref={dialog}
        alert
        title="Cancel this order?"
        description="We'll refund everything you paid, including delivery, to your original payment method."
        footer={
          <>
            <Button type="button" variant="outline" disabled={busy} onClick={() => dialog.current?.close()}>
              Keep my order
            </Button>
            <Button type="button" variant="destructive" disabled={busy} onClick={cancel}>
              {busy ? "Cancelling…" : "Yes, cancel it"}
            </Button>
          </>
        }
      >
        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
      </Dialog>
    </>
  )
}
