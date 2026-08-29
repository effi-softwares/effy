"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

/**
 * Cancelling an order (055 US2, FR-012).
 *
 * A client island on an otherwise server-rendered page — the order detail is a request-time server read
 * and stays that way; only this needs to be interactive.
 *
 * ⚠ IT IS RENDERED ONLY WHEN THE SERVER SAYS SO. `cancellable` is derived in `core-api` from the shop
 * portions and put on the wire; this component never works it out from `stage` or `fulfillments`. That
 * is the `summarizeFulfillment` mistake 052 deleted — two implementations of one rule, diverging
 * silently because both still render something. Here the cost is a shopper offered a button that
 * refuses, or denied one that would have worked.
 *
 * ⚠ AND THE SERVER STILL DECIDES. A shop can start picking between this page loading and the tap, so
 * the platform re-decides inside a row lock (FR-017) and this may be refused. The refusal is shown as
 * what it is, not as an error.
 */
export function CancelOrder({ orderId }: { orderId: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function cancel() {
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/orders/${orderId}/cancel`, { method: "POST" })
    setBusy(false)

    if (res.ok) {
      setConfirming(false)
      // ⚠ Re-read from the server rather than patching local state. The order's status, its stage and
      // its refund all changed, and this component knows about none of them.
      router.refresh()
      return
    }
    if (res.status === 401) {
      router.push(`/sign-in?next=/orders/${orderId}`)
      return
    }
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    // ⚠ The server's own sentence, which says someone has started preparing it AND that we can still
    // help. A generic "something went wrong" here would lose the only part a shopper can act on.
    setError(body?.error ?? "We couldn’t cancel that just now. Please contact us.")
  }

  if (!confirming) {
    return (
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="w-full rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-accent"
        >
          Cancel this order
        </button>
        {error ? (
          <p role="alert" className="text-[13px] text-muted-foreground">
            {error}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border p-4">
      {/* ⚠ A confirmation, because this returns money and empties an order the shopper may have spent
          time building. It names what happens rather than asking "are you sure?" — which tells nobody
          anything. */}
      <p className="text-sm">
        Cancel this order? We’ll refund everything you paid, including delivery, to your original
        payment method.
      </p>
      <div className="flex gap-2.5">
        <button
          type="button"
          disabled={busy}
          onClick={cancel}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Cancelling…" : "Yes, cancel it"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirming(false)}
          className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Keep my order
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-[13px] text-muted-foreground">
          {error}
        </p>
      ) : null}
    </div>
  )
}
