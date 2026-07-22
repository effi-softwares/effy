"use client"

import { Elements } from "@stripe/react-stripe-js"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import type {
  AddressDTO,
  CreateCheckoutIntentResponse,
  DeliveryQuoteResponse,
  DeliverySelectionDTO,
} from "@effy/shared-types"

import { clearCart, mergePayload, useCart } from "@/lib/cart-store"
import { computeCartTotals } from "@/lib/cart-totals"
import { formatMoney } from "@/lib/money"
import { getStripe } from "@/lib/stripe"
import { capture } from "@/lib/telemetry"

import { AddressPicker } from "./AddressPicker"
import { BillingSection } from "./BillingSection"
import { DeliveryOptions } from "./DeliveryOptions"
import { PaymentForm } from "./PaymentForm"

type Step = "review" | "delivery" | "paying"

/**
 * The checkout flow (021, extending 019's US3). On mount it merges the device-local guest cart into the
 * authoritative server cart, then walks three steps:
 *
 *   review (address)  →  delivery (per-package options)  →  paying (Stripe Payment Element)
 *
 * After the customer picks an address we QUOTE the hot path (`/v1/checkout/quote`) for the anonymous
 * per-package options; the delivery step prices them client-side for display only. At placement we send
 * the captured `quoteId` + the customer's per-package `selections` + the confirmed `excludedPackageKeys`
 * to `/v1/checkout/intent`. The server owns every fee (SC-004). A 409 means the captured quote is stale
 * (expired, or a package/rate changed) — we RE-QUOTE and re-show the options, never blind-retry (FR-011a).
 *
 * 023 reconciles the review step to the 022 Address Book: the customer's saved addresses drive a picker
 * (default pre-selected as SHIPPING — FR-001) with an inline add-new, and a "Billing same as shipping"
 * toggle. Switching the shipping address invalidates the captured quote so delivery/amount re-price for
 * the new destination before pay (FR-005). Billing defaults to shipping (NULL) and only sends a
 * `billingAddressId` when the customer diverges (FR-008–FR-013).
 */
export function CheckoutFlow({ initialAddresses }: { initialAddresses: AddressDTO[] }) {
  const router = useRouter()
  const guestLines = useCart()
  // Freeze the cart being checked out. The mount effect below merges these lines into the
  // authoritative SERVER cart and then CLEARS the local guest cart — so `useCart()` is empty by
  // design for the rest of the flow. If the estimate and the "has items" gate read the LIVE guest
  // cart, the price would drop to $0 and Continue would disable the instant the merge resolves.
  // Snapshot the lines the first time we have them, and never let the post-merge clear reset them
  // (the server owns the real amount; this snapshot is display + a has-items gate only).
  const [orderLines, setOrderLines] = useState(guestLines)
  useEffect(() => {
    if (guestLines.length > 0 && orderLines.length === 0) setOrderLines(guestLines)
  }, [guestLines, orderLines])
  const estimate = useMemo(() => computeCartTotals(orderLines), [orderLines])
  const currency = orderLines[0]?.currency ?? "AUD"

  const [addresses, setAddresses] = useState<AddressDTO[]>(initialAddresses)
  // Pre-select the SHIPPING address (FR-001): the default, else — when none is default — the first of
  // the default-first list, a deterministic most-recent choice (FR-002).
  const [selectedId, setSelectedId] = useState<string | null>(
    initialAddresses.find((a) => a.isDefault)?.id ?? initialAddresses[0]?.id ?? null,
  )
  // Billing defaults to "same as shipping" (FR-009); `billingId` is only meaningful while the toggle is
  // OFF, and is discarded when it returns ON (FR-013).
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true)
  const [billingId, setBillingId] = useState<string | null>(null)
  const [step, setStep] = useState<Step>("review")
  const [quote, setQuote] = useState<DeliveryQuoteResponse | null>(null)
  const [intent, setIntent] = useState<CreateCheckoutIntentResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
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

  /** Reflect a newly created address into the shared saved-address list (dedup on id). */
  function appendAddress(created: AddressDTO) {
    setAddresses((prev) => (prev.some((a) => a.id === created.id) ? prev : [...prev, created]))
  }

  // Switch the SHIPPING address (a per-order choice — never the saved default, FR-006). Invalidate the
  // captured quote so delivery/amount re-price for the new destination on the next continue (FR-005).
  function selectShipping(id: string) {
    if (id === selectedId) return
    setSelectedId(id)
    setQuote(null)
    capture({ name: "checkout_address_changed" })
  }

  // A new address added from the shipping picker → save it, select it as shipping, re-price (FR-005).
  function onShippingAddressAdded(created: AddressDTO) {
    appendAddress(created)
    setSelectedId(created.id)
    setQuote(null)
    capture({ name: "checkout_address_added" })
  }

  // Switch the BILLING address (toggle already OFF). A billing distinct from shipping is a divergence.
  function selectBilling(id: string) {
    setBillingId(id)
    if (id !== selectedId) capture({ name: "checkout_billing_diverged" })
  }

  function onBillingAddressAdded(created: AddressDTO) {
    appendAddress(created)
    setBillingId(created.id)
    capture({ name: "checkout_address_added" })
    if (created.id !== selectedId) capture({ name: "checkout_billing_diverged" })
  }

  // The "same as shipping" toggle. Turning it back ON discards any divergent billing choice (FR-013).
  function toggleBillingSame(value: boolean) {
    setBillingSameAsShipping(value)
    if (value) setBillingId(null)
  }

  // Pay is blocked until shipping is set (FR-007) and, when billing diverges, a billing address is
  // chosen (FR-012). Enforced at the review → delivery gate, before any payment.
  const canContinue =
    !!selectedId && (billingSameAsShipping || !!billingId) && orderLines.length > 0

  /** Quote the address for its per-package options. Returns the fresh quote, or null on failure. */
  async function fetchQuote(addressId: string): Promise<DeliveryQuoteResponse | null> {
    const res = await fetch("/api/checkout/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addressId }),
    })
    const data = (await res.json().catch(() => ({}))) as Partial<DeliveryQuoteResponse> & {
      error?: string
    }
    if (!res.ok || !data.packages) {
      setError(data.error ?? "We couldn’t work out delivery for this address. Please try again.")
      return null
    }
    return data as DeliveryQuoteResponse
  }

  // Address chosen → quote and advance to the delivery step (re-derives on every address change, FR-006).
  async function continueToDelivery() {
    if (!selectedId) {
      setError("Choose a delivery address.")
      return
    }
    if (!billingSameAsShipping && !billingId) {
      setError("Choose a billing address.")
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const q = await fetchQuote(selectedId)
      if (q) {
        setQuote(q)
        setStep("delivery")
      }
    } finally {
      setBusy(false)
    }
  }

  // Place the order from the captured quote + the customer's selections. A 409 re-quotes (FR-011a).
  async function placeOrder(selections: DeliverySelectionDTO[], excludedPackageKeys: string[]) {
    if (!selectedId || !quote) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      // Send `billingAddressId` ONLY when the customer diverged — the toggle is OFF and the chosen
      // billing differs from shipping. Same-as / equal → omit it so the server stores NULL (FR-009/010).
      const body: Record<string, unknown> = {
        addressId: selectedId,
        quoteId: quote.quoteId,
        selections,
        excludedPackageKeys,
      }
      if (!billingSameAsShipping && billingId && billingId !== selectedId) {
        body.billingAddressId = billingId
      }
      const res = await fetch("/api/checkout/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (res.status === 409) {
        // The captured quote is stale — re-quote and re-show the options with the new amounts. Never
        // charge on a blind retry (FR-011a / SC-004).
        const fresh = await fetchQuote(selectedId)
        if (fresh) {
          setQuote(fresh)
          setNotice("Delivery options changed. Please review the updated prices before paying.")
        }
        return
      }

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
          onClick={() => setStep("delivery")}
          className="mt-4 text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back
        </button>
      </div>
    )
  }

  if (step === "delivery" && quote) {
    return (
      <DeliveryOptions
        packages={quote.packages}
        itemSubtotal={estimate.itemSubtotal}
        currency={currency}
        busy={busy}
        error={error}
        notice={notice}
        onConfirm={placeOrder}
        onBack={() => {
          setStep("review")
          setNotice(null)
          setError(null)
        }}
      />
    )
  }

  return (
    <div className="mt-6 space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Delivery address</h2>
        <AddressPicker
          addresses={addresses}
          selectedId={selectedId}
          onSelect={selectShipping}
          onAddressAdded={onShippingAddressAdded}
          idPrefix="shipping"
          busy={busy}
        />
      </section>

      <BillingSection
        sameAsShipping={billingSameAsShipping}
        onSameAsShippingChange={toggleBillingSame}
        addresses={addresses}
        billingId={billingId}
        onBillingSelect={selectBilling}
        onAddressAdded={onBillingAddressAdded}
      />

      <div className="flex items-baseline justify-between border-y py-3">
        <span className="text-sm text-muted-foreground">Items</span>
        <span className="text-lg font-semibold">{formatMoney(estimate.itemSubtotal, currency)}</span>
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">Delivery is calculated in the next step.</p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        type="button"
        onClick={continueToDelivery}
        disabled={busy || !canContinue}
        className="flex h-12 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        Continue to delivery
      </button>
    </div>
  )
}

function OrderSummary({ currency, total }: { currency: string; total: string }) {
  return (
    <div className="flex items-baseline justify-between border-y py-3">
      <span className="text-sm text-muted-foreground">Total</span>
      <span className="text-lg font-semibold">{formatMoney(total, currency)}</span>
    </div>
  )
}
