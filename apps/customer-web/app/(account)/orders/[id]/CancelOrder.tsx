"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"

/**
 * Cancel an order the shopper may still cancel: shown only while the server says `cancellable` (advice;
 * the server decides again). The question names what happens (everything refunded, delivery included),
 * and a refusal is shown in it.
 */
export function CancelOrder({ orderId }: { orderId: string }) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function cancel() {
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/orders/${orderId}/cancel`, { method: "POST" })
    setBusy(false)
    if (res.ok) {
      setDialogOpen(false)
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
      <Button type="button" variant="ghost" onClick={() => setDialogOpen(true)}>
        Cancel this order
      </Button>
      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        alert
        title="Cancel this order?"
        description="We'll refund everything you paid, including delivery, to your original payment method."
        footer={
          <>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setDialogOpen(false)}>
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
