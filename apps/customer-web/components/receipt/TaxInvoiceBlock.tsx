"use client"

import { useState } from "react"

import type { OrderTaxDocumentsDTO } from "@effy/shared-types"

import { Button } from "@/components/ui/button"
import { capture } from "@/lib/telemetry"
import { Input, Label } from "@/components/ui/form"

const DAY = new Intl.DateTimeFormat("en-AU", { dateStyle: "long", timeZone: "Australia/Melbourne" })

/** Each refusal in the customer's words - never the server's prose. */
const REFUSAL: Record<string, string> = {
  invoices_unavailable: "Tax invoices aren't available yet. Please try again later.",
  invoice_not_available_for_order: "A tax invoice isn't available for this order.",
  buyer_identity_required: "Orders of $1,000 or more need your name on the invoice. Add it in Account → Profile, then try again.",
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; docs: OrderTaxDocumentsDTO }
  | { kind: "refused"; text: string }

/**
 * The tax invoice, on request. "Get tax invoice" issues it: an issued invoice
 * never changes, so the optional business details are offered before, never after.
 */
export function TaxInvoiceBlock({ orderId }: { orderId: string }) {
  const [state, setState] = useState<State>({ kind: "idle" })
  const [business, setBusiness] = useState(false)
  const [name, setName] = useState("")
  const [abn, setAbn] = useState("")
  const [businessNote, setBusinessNote] = useState<string | null>(null)
  const base = `/api/orders/${encodeURIComponent(orderId)}`

  async function load() {
    setState({ kind: "loading" })
    const res = await fetch(`${base}/documents/tax`, { cache: "no-store" })
    if (res.ok) return setState({ kind: "ready", docs: (await res.json()) as OrderTaxDocumentsDTO })
    const body = (await res.json().catch(() => ({}))) as { reason?: string }
    setState({ kind: "refused", text: REFUSAL[body.reason ?? ""] ?? "We couldn't get your tax invoice just now. Please try again." })
  }

  async function saveBusiness() {
    const res = await fetch(`${base}/business-identity`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessName: name.trim() || null, abn: abn.replace(/\s+/g, "") || null }),
    })
    if (res.ok || res.status === 204) {
      setBusiness(false)
      setBusinessNote("Saved. Your business details will be on the invoice.")
    } else {
      const body = (await res.json().catch(() => ({}))) as { reason?: string }
      setBusinessNote(body.reason === "abn_invalid" ? "That ABN isn't valid. Check the 11 digits." : "We couldn't save that. The invoice may already have been issued.")
    }
  }

  if (state.kind === "ready") {
    const docs = [state.docs.invoice, ...state.docs.adjustments].filter((d): d is NonNullable<typeof d> => d !== null)
    return (
      <ul className="divide-y text-sm" aria-label="Tax documents">
        {docs.map((d) => (
          <li key={d.number} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
            <span>
              {d.kind === "invoice" ? "Tax invoice" : "Adjustment note"} · <span className="font-mono">{d.number}</span> ·{" "}
              {DAY.format(new Date(d.issuedAt))}
            </span>
            <a
              href={`${base}/documents/tax?doc=${encodeURIComponent(d.number)}`}
              download
              onClick={() => capture({ name: "tax_invoice_downloaded", props: { kind: d.kind } })}
              className="font-medium text-primary underline underline-offset-4"
            >
              Download PDF
            </a>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="space-y-3 text-sm">
      {state.kind === "refused" ? <p role="status">{state.text}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={state.kind === "loading"}>
          {state.kind === "loading" ? "Getting your invoice…" : "Get tax invoice"}
        </Button>
        {!business ? (
          <Button variant="link" size="sm" onClick={() => setBusiness(true)}>
            Add a business name and ABN (optional)
          </Button>
        ) : null}
      </div>
      {business ? (
        <div className="grid max-w-md gap-2">
          <Label htmlFor="biz-name">Business name</Label>
          <Input id="biz-name" value={name} onChange={(e) => setName(e.target.value)} />
          <Label htmlFor="biz-abn">ABN</Label>
          <Input id="biz-abn" value={abn} onChange={(e) => setAbn(e.target.value)} inputMode="numeric" />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void saveBusiness()}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setBusiness(false)}>
              Cancel
            </Button>
          </div>
          <p className="text-muted-foreground">Add these before you get the invoice - an issued invoice can't be changed.</p>
        </div>
      ) : null}
      {businessNote ? <p role="status">{businessNote}</p> : null}
    </div>
  )
}
