"use client"

import { Elements } from "@stripe/react-stripe-js"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import type { AddressDTO, CreateCheckoutIntentResponse } from "@effy/shared-types"

import { clearCart, mergePayload, useCart } from "@/lib/cart-store"
import { computeCartTotals } from "@/lib/cart-totals"
import { formatMoney } from "@/lib/money"
import { getStripe } from "@/lib/stripe"

import { AddressForm } from "./AddressForm"
import { PaymentForm } from "./PaymentForm"

type Step = "review" | "paying"

/**
 * The checkout flow (US3). On mount it merges the device-local guest cart into the authoritative server
 * cart (once, since the customer just signed in), then collects a delivery address and hands off to the
 * Stripe Payment Element. The server computes the real total; this UI only shows an estimate.
 */
export function CheckoutFlow({ initialAddresses }: { initialAddresses: AddressDTO[] }) {
  const router = useRouter()
  const guestLines = useCart()
  const estimate = useMemo(() => computeCartTotals(guestLines), [guestLines])

  const [addresses, setAddresses] = useState<AddressDTO[]>(initialAddresses)
  const [selectedId, setSelectedId] = useState<string | null>(
    initialAddresses.find((a) => a.isDefault)?.id ?? initialAddresses[0]?.id ?? null,
  )
  const [step, setStep] = useState<Step>("review")
  const [intent, setIntent] = useState<CreateCheckoutIntentResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Merge the guest cart into the server cart exactly once, then clear the local copy.
  useEffect(() => {
    const lines = mergePayload(guestLines)
    if (lines.length === 0) return
    void fetch("/api/cart/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines }),
    }).then((res) => {
      if (res.ok) clearCart()
    })
    // Intentionally run once on mount; the guest lines are a snapshot at entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function addAddress(payload: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        setError("Please check the address and try again.")
        return
      }
      const created = (await res.json()) as AddressDTO
      setAddresses((prev) => [...prev, created])
      setSelectedId(created.id)
    } finally {
      setBusy(false)
    }
  }

  async function continueToPayment() {
    if (!selectedId) {
      setError("Choose a delivery address.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/checkout/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addressId: selectedId }),
      })
      const data = (await res.json().catch(() => ({}))) as Partial<CreateCheckoutIntentResponse> & {
        error?: string
      }
      if (!res.ok || !data.clientSecret) {
        setError(data.error ?? "We couldn’t start payment. Please try again.")
        return
      }
      setIntent(data as CreateCheckoutIntentResponse)
      setStep("paying")
    } finally {
      setBusy(false)
    }
  }

  if (step === "paying" && intent) {
    return (
      <div className="mt-6">
        <OrderSummary currency={intent.currency} total={intent.grandTotalAmount} />
        <Elements stripe={getStripe()} options={{ clientSecret: intent.clientSecret }}>
          <PaymentForm
            orderId={intent.orderId}
            onSuccess={() => router.push(`/checkout/complete?order=${intent.orderId}`)}
          />
        </Elements>
        <button
          type="button"
          onClick={() => setStep("review")}
          className="mt-4 text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back
        </button>
      </div>
    )
  }

  return (
    <div className="mt-6 space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Delivery address</h2>
        {addresses.length > 0 ? (
          <ul className="space-y-2">
            {addresses.map((a) => (
              <li key={a.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-accent">
                  <input
                    type="radio"
                    name="address"
                    className="mt-1"
                    checked={selectedId === a.id}
                    onChange={() => setSelectedId(a.id)}
                  />
                  <span className="text-sm">
                    <span className="font-medium">{a.recipientName}</span>
                    <br />
                    {a.line1}
                    {a.line2 ? `, ${a.line2}` : ""}, {a.city} {a.postalCode}, {a.country}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Add a delivery address to continue.</p>
        )}
        <AddressForm onSubmit={addAddress} busy={busy} />
      </section>

      <OrderSummary currency={guestLines[0]?.currency ?? "AUD"} total={estimate.grandTotal} estimate />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        type="button"
        onClick={continueToPayment}
        disabled={busy || !selectedId || guestLines.length === 0}
        className="flex h-12 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        Continue to payment
      </button>
    </div>
  )
}

function OrderSummary({
  currency,
  total,
  estimate,
}: {
  currency: string
  total: string
  estimate?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between border-y py-3">
      <span className="text-sm text-muted-foreground">{estimate ? "Estimated total" : "Total"}</span>
      <span className="text-lg font-semibold">{formatMoney(total, currency)}</span>
    </div>
  )
}
