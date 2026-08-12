"use client"

import { Elements } from "@stripe/react-stripe-js"
import { ArrowLeft, CreditCard } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import type {
  AddressDTO,
  CreateCheckoutIntentResponse,
} from "@effy/shared-types"

import { ActionButton } from "@/components/storefront/actions"
import { useCart } from "@/lib/cart-store"
import { computeCartTotals } from "@/lib/cart-totals"
import { formatMoney } from "@/lib/money"
import { getStripe } from "@/lib/stripe"
import { capture } from "@/lib/telemetry"

import { AddressPicker } from "./AddressPicker"
import { BillingSection } from "./BillingSection"
import { PaymentForm } from "./PaymentForm"

type Step = "review" | "paying"

/**
 * The checkout flow (021, extending 019's US3; reworked 027). It walks three steps:
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
  // 027: the mirror is what the UI reads, and nothing here empties it — the cart is cleared only when an
  // order is actually paid for (FR-058). The estimate and the "has items" gate read it live; the AMOUNT is
  // never taken from it, because the platform computes every figure that is charged (FR-027).
  const estimate = useMemo(() => computeCartTotals(guestLines), [guestLines])
  const currency = guestLines[0]?.currency ?? "AUD"

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
  const [intent, setIntent] = useState<CreateCheckoutIntentResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // ⚠ 027: the checkout-entry cart snapshot is GONE, and its route with it.
  //
  // Under 019's Option B the device cart was the source of truth, so checkout had to PUT it to the server
  // before quoting. The platform is authoritative now (research R0), which means checkout quotes and
  // prices the SAME cart every other surface reads. Keeping a snapshot here would hand checkout a second
  // source of truth — which is exactly the 2026-07-23 bug family (a cart emptied by entering checkout, a
  // prior attempt's items reappearing) under a new name. The device cart is folded into the account cart
  // ONCE, at sign-in, via `POST /api/cart/merge`.

  /** Reflect a newly created address into the shared saved-address list (dedup on id). */
  function appendAddress(created: AddressDTO) {
    setAddresses((prev) => (prev.some((a) => a.id === created.id) ? prev : [...prev, created]))
  }

  // Switch the SHIPPING address (a per-order choice — never the saved default, FR-006). Invalidate the
  // captured quote so delivery/amount re-price for the new destination on the next continue (FR-005).
  function selectShipping(id: string) {
    if (id === selectedId) return
    setSelectedId(id)
    capture({ name: "checkout_address_changed" })
  }

  // A new address added from the shipping picker → save it, select it as shipping, re-price (FR-005).
  function onShippingAddressAdded(created: AddressDTO) {
    appendAddress(created)
    setSelectedId(created.id)
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
    !!selectedId && (billingSameAsShipping || !!billingId) && guestLines.length > 0

  /**
   * Place the order.
   *
   * ⚠ THERE IS NO DELIVERY STEP. This used to quote the address, walk the shopper through
   * per-package options, and send a captured quote id with their selections. Delivery zones, quotes
   * and fees were withdrawn from the platform, so checkout is: choose an address, pay.
   */
  async function placeOrder() {
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
      // Send `billingAddressId` ONLY when the customer diverged — the toggle is OFF and the chosen
      // billing differs from shipping. Same-as / equal → omit it so the server stores NULL (FR-009/010).
      const body: Record<string, unknown> = { addressId: selectedId }
      if (!billingSameAsShipping && billingId && billingId !== selectedId) {
        body.billingAddressId = billingId
      }
      const res = await fetch("/api/checkout/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
      <div>
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
    // 025 FR-042: two columns above `lg`, with the summary STICKY. The amount payable used to scroll
    // away from the form it belongs to, so a shopper filling in an address could not see what they
    // were about to be charged — a well-documented cause of checkout abandonment.
    <div className="grid gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
    <div className="space-y-6">
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

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center justify-between gap-4 pt-6">
        <ActionButton
          type="button"
          variant="outline"
          onClick={() => router.push("/cart")}
          disabled={busy}
          size="md"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back
        </ActionButton>
        <ActionButton
          type="button"
          onClick={placeOrder}
          disabled={busy || !canContinue}
          size="md"
        >
          <CreditCard className="size-4" aria-hidden="true" />
          Continue to payment
        </ActionButton>
      </div>
    </div>

    {/* `position: sticky` in a grid — no scroll listener, no JavaScript, and it collapses to normal
        flow below `lg` where there is no second column and nothing to stick to. */}
    {/* Order summary — same structure as the cart's (heading, item/delivery rows, a bordered total),
        rendered as a bordered card. Delivery and the final total are only known once an address is
        chosen, so the total shows the item subtotal with a "+ delivery" note, exactly as the cart does. */}
    <aside className="rounded-lg border p-6 lg:sticky lg:top-24">
      <h2 className="text-xl font-bold">Order Summary</h2>
      <dl className="mt-5 space-y-4">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Items</dt>
          <dd className="font-bold">{formatMoney(estimate.itemSubtotal, currency)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Delivery</dt>
          <dd className="text-sm text-muted-foreground">Calculated next step</dd>
        </div>
        <div className="border-t pt-4">
          <div className="flex items-center justify-between">
            <dt className="text-lg">Total</dt>
            <dd className="text-2xl font-bold">
              {formatMoney(estimate.itemSubtotal, currency)}
              <span className="ml-1 align-middle text-xs font-normal text-muted-foreground">
                + delivery
              </span>
            </dd>
          </div>
        </div>
      </dl>
    </aside>
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
