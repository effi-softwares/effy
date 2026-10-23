"use client"

import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { MessageSquare, Send } from "lucide-react"

import { Field, select } from "@/components/storefront/kit"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/form"

/**
 * "Something wrong with this order?": a request attached to the order, not a refund (staff decide, and
 * the confirmation says so). Items are optional; what went wrong is sent as words leading the message.
 */
const REASONS = ["An item was damaged", "Something was missing", "Wrong item", "Delivery problem", "Something else"] as const

export function RequestRefund({
  orderId,
  orderNumber,
  items,
}: {
  orderId: string
  orderNumber?: string
  items: { orderItemId: string; productName: string; quantity: number }[]
}) {
  const router = useRouter()
  const dialog = useRef<HTMLDialogElement>(null)
  const [reason, setReason] = useState<string>(REASONS[0])
  const [details, setDetails] = useState("")
  const [selected, setSelected] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy || details.trim() === "") return
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/orders/${orderId}/refund-requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: `${reason}: ${details.trim()}`,
        items: Object.entries(selected).map(([orderItemId, quantity]) => ({ orderItemId, quantity })),
      }),
    })
    setBusy(false)
    if (res.ok) {
      setSent(true)
      dialog.current?.close()
      router.refresh()
      return
    }
    if (res.status === 401) {
      router.push(`/sign-in?next=/orders/${orderId}`)
      return
    }
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    setError(body?.error ?? "We couldn’t send that just now. Please try again.")
  }

  if (sent) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Thanks — we’ve got it and we’ll look into this order. We’ll be in touch about what happens next.
      </p>
    )
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => dialog.current?.showModal()}>
        <MessageSquare aria-hidden="true" />
        Report a problem
      </Button>

      <Dialog
        ref={dialog}
        size="lg"
        title="Something wrong with this order?"
        description={`${orderNumber ? `Order ${orderNumber} · ` : ""}Tell us what happened and we'll look into it.`}
        footer={
          <>
            <Button type="button" variant="outline" disabled={busy} onClick={() => dialog.current?.close()}>
              Cancel
            </Button>
            <Button type="submit" form="report-problem-form" disabled={busy || details.trim() === ""}>
              <Send aria-hidden="true" />
              {busy ? "Sending…" : "Send"}
            </Button>
          </>
        }
      >
        <form id="report-problem-form" onSubmit={submit} className="flex flex-col gap-4">
          <Field label="What went wrong?" htmlFor="report-reason">
            <select id="report-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={select}>
              {REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>

          {items.length > 0 ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm leading-none font-medium">Which items, if it helps?</legend>
              {items.map((item) => (
                <label key={item.orderItemId} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
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

          <Field label="Details" htmlFor="report-details" hint="Don't include card numbers or passwords.">
            <Textarea
              id="report-details"
              rows={3}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="e.g. one carton was split open when it arrived"
            />
          </Field>

          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </form>
      </Dialog>
    </>
  )
}
