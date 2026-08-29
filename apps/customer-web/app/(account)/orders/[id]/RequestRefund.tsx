"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

/**
 * Asking for a refund (055 US3, FR-005r).
 *
 * ⚠ IT REPLACES "Get help" POINTING AT A GENERIC FORM WITH NO ORDER ATTACHED. Until this, a shopper
 * describing a missing item landed in the 046 feedback inbox where nobody could see which order they
 * meant — which is the customer half of gap G3.
 *
 * ⚠ IT MUST NOT READ AS A DECISION. The wording says the ask was received, never that a refund is
 * coming: a person decides, and promising one here would be a commitment nobody has made, on the
 * screen where a shopper is most likely to hold us to it.
 *
 * ⚠ NAMING ITEMS IS OPTIONAL. A shopper who cannot point at one line — "the whole thing arrived
 * warm" — must still be able to ask, or they are pushed back to the generic inbox this replaces.
 */
export function RequestRefund({
  orderId,
  items,
}: {
  orderId: string
  items: { orderItemId: string; productName: string; quantity: number }[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [selected, setSelected] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function submit() {
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/orders/${orderId}/refund-requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: message.trim(),
        items: Object.entries(selected).map(([orderItemId, quantity]) => ({ orderItemId, quantity })),
      }),
    })
    setBusy(false)

    if (res.ok) {
      setSent(true)
      setOpen(false)
      router.refresh()
      return
    }
    if (res.status === 401) {
      router.push(`/sign-in?next=/orders/${orderId}`)
      return
    }
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    // ⚠ The server's own sentence. A 409 says their ask is already with us, which is the one thing
    // that stops them raising it again through the generic inbox.
    setError(body?.error ?? "We couldn’t send that just now. Please try again.")
  }

  if (sent) {
    return (
      <p role="status" className="text-[13px] text-muted-foreground">
        Thanks — we’ve got it and we’ll look into this order. We’ll be in touch about what happens next.
      </p>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-accent"
      >
        Something wrong with this order?
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="refund-request-message" className="text-sm font-medium">
          What went wrong?
        </label>
        <textarea
          id="refund-request-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          className="rounded-lg border px-3 py-2 text-sm"
          placeholder="e.g. two cartons of milk were missing"
        />
      </div>

      {items.length > 0 ? (
        <fieldset className="flex flex-col gap-1.5">
          {/* ⚠ "if it helps" — naming items is genuinely optional, and a legend that implied
              otherwise would send the shopper who cannot answer it back to the generic inbox. */}
          <legend className="text-sm font-medium">Which items, if it helps?</legend>
          {items.map((item) => (
            <label key={item.orderItemId} className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={Boolean(selected[item.orderItemId])}
                onChange={(e) =>
                  setSelected((s) => {
                    const next = { ...s }
                    if (e.target.checked) next[item.orderItemId] = item.quantity
                    else delete next[item.orderItemId]
                    return next
                  })
                }
              />
              {item.productName}
            </label>
          ))}
        </fieldset>
      ) : null}

      <div className="flex gap-2.5">
        <button
          type="button"
          disabled={busy || message.trim() === ""}
          onClick={submit}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Sending…" : "Send"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen(false)}
          className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Cancel
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
