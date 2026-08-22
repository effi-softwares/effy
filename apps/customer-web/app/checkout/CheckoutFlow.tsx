"use client"

import { Elements } from "@stripe/react-stripe-js"
import { ArrowLeft, CreditCard } from "lucide-react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import type {
  AddressDTO,
  CreateCheckoutIntentResponse,
  DeliveryQuoteDTO,
} from "@effy/shared-types"

import { ActionButton } from "@/components/storefront/actions"
import { useCart } from "@/lib/cart-store"
import { computeCartTotals, formatCents, parseCents } from "@/lib/cart-totals"
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
  // 047: the delivery quote for the chosen address — serviceability + the standard fee, shown BEFORE
  // pay (no drip). The server owns the fee; this display never sends one. Re-fetched when the shipping
  // address changes (FR-004/033/036).
  const [quote, setQuote] = useState<DeliveryQuoteDTO | null>(null)
  const [quoting, setQuoting] = useState(false)
  // 047 US2: the shopper's delivery-method choice. Same-day is offered only when EVERY package can do it
  // (single-shop is the common case); a mixed basket falls back to standard here rather than surface
  // hidden fulfilment. The server applies the preference per package and prices it (FR-044).
  const [method, setMethod] = useState<"standard" | "same_day">("standard")

  useEffect(() => {
    if (!selectedId) {
      setQuote(null)
      return
    }
    let cancelled = false
    setQuoting(true)
    setQuote(null)
    void (async () => {
      try {
        const res = await fetch("/api/checkout/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addressId: selectedId }),
        })
        const data = (await res.json().catch(() => null)) as DeliveryQuoteDTO | null
        if (!cancelled && res.ok && data) setQuote(data)
      } finally {
        if (!cancelled) setQuoting(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedId])

  // Same-day is offerable only when the quote gives EVERY package a same_day option (so the customer,
  // who never sees packages, is offered one honest order-level choice). Otherwise standard only.
  const sameDayOfferable = useMemo(
    () =>
      quote?.serviced === true &&
      quote.packages.length > 0 &&
      quote.packages.every((pkg) => pkg.options.some((o) => o.method === "same_day")),
    [quote],
  )

  // Reset the choice to standard whenever a new quote arrives (a new address may not offer same-day).
  useEffect(() => {
    if (!sameDayOfferable) setMethod("standard")
  }, [sameDayOfferable])

  // The delivery fee is the sum of each package's option for the chosen method (falling back to standard
  // per package). GST-inclusive, already snapped up by the server. Distance / shop identity never appear
  // here (FR-018/033).
  const deliveryCents = useMemo(() => {
    if (!quote?.serviced) return 0
    return quote.packages.reduce((sum, pkg) => {
      const chosen = pkg.options.find((o) => o.method === method)
      const std = pkg.options.find((o) => o.method === "standard") ?? pkg.options[0]
      const opt = chosen ?? std
      return sum + (opt ? parseCents(opt.feeAmount) : 0)
    }, 0)
  }, [quote, method])

  const serviced = quote?.serviced === true
  const totalCents = parseCents(estimate.itemSubtotal) + deliveryCents

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
    !!selectedId && (billingSameAsShipping || !!billingId) && guestLines.length > 0 && serviced

  /**
   * Place the order.
   *
   * 047: delivery is back, but standard-only for US1 — there is no per-package method choice yet, so the
   * shopper picks an address and pays. The server computes + captures the delivery fee at intent from the
   * destination zone + package weights (SC-004); the grand total it returns already includes it. A
   * not-serviceable address is refused server-side (ErrNotServiceable) and blocked here (canContinue).
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
      if (method === "same_day" && sameDayOfferable) {
        body.deliveryMethod = "same_day"
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
    <div className="space-y-12">
      {/* Shipping + billing are ONE logical group — kept tight internally; the big `space-y-16`
          separates this group from the order review and the buttons, not the fields within it. */}
      <div className="space-y-6">
        <section>
          <h2 className="mb-3 text-xl font-semibold">Delivery address</h2>
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
      </div>

      {/* Order review — a READ-ONLY recap of exactly what is being paid for, right before the pay
          button. Compact rows on purpose (small thumb + name×qty + line total, no photos-as-hero) and no
          steppers or remove: quantity and removal are the CART's job, and an editable control here would
          make two screens own one number. "Edit cart" is the single escape hatch back to /cart. */}
      {guestLines.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-semibold">Review your order</h2>
          <ul className="">
            {guestLines.map((line) => (
              <li key={line.productId} className="flex items-center gap-4 py-2">
                <div className="relative size-12 shrink-0 overflow-hidden rounded-md border bg-muted">
                  {line.imageUrl ? (
                    <Image
                      src={line.imageUrl}
                      alt=""
                      fill
                      unoptimized
                      sizes="3rem"
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 ">
                  <p className="truncate text-sm font-medium">{line.name}</p>
                  <p className="text-xs text-muted-foreground">Qty {line.quantity}</p>
                </div>
                <span className="shrink-0 font-semibold">
                  {formatMoney(
                    formatCents(parseCents(line.unitPriceAmount) * line.quantity),
                    line.currency,
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center justify-between gap-4">
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
    </div>

    {/* Order summary — same structure as the cart's (heading, item/delivery rows, a bordered total),
        rendered as a bordered card. Delivery and the final total are only known once an address is
        chosen, so the total shows the item subtotal with a "+ delivery" note, exactly as the cart does. */}
    <aside className="rounded-lg border p-6">
      <h2 className="text-xl font-bold">Order Summary</h2>
      <dl className="mt-5 space-y-4">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Items</dt>
          <dd className="font-bold">{formatMoney(estimate.itemSubtotal, currency)}</dd>
        </div>
        {/* 047 US2: when same-day is available for the whole order, the shopper chooses their speed. The
            fee updates live; the server re-prices and never trusts a client fee. */}
        {serviced && sameDayOfferable ? (
          <fieldset className="space-y-2">
            <legend className="mb-1 text-muted-foreground">Delivery speed</legend>
            {(["standard", "same_day"] as const).map((m) => (
              <label key={m} className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="delivery-method"
                    value={m}
                    checked={method === m}
                    onChange={() => setMethod(m)}
                  />
                  {m === "same_day" ? "Same-day delivery" : "Standard delivery"}
                </span>
                <span className="font-medium">{formatMoney(formatCents(methodTotalCents(quote, m)), currency)}</span>
              </label>
            ))}
          </fieldset>
        ) : (
          <div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Delivery</dt>
              <dd className="text-sm">
                {!selectedId ? (
                  <span className="text-muted-foreground">Select an address</span>
                ) : quoting ? (
                  <span className="text-muted-foreground">Calculating…</span>
                ) : quote && !serviced ? (
                  <span className="text-destructive">Not available</span>
                ) : serviced ? (
                  <span className="font-medium">
                    Standard · {formatMoney(formatCents(deliveryCents), currency)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </dd>
            </div>
            {/* 047: when the order is serviced but same-day isn't offered, say so — a shopper should know
                same-day was considered, not silently omitted. */}
            {serviced && !sameDayOfferable ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Same-day delivery isn’t available for this address.
              </p>
            ) : null}
          </div>
        )}
        <div className="border-t pt-4">
          <div className="flex items-center justify-between">
            <dt className="text-lg">Total</dt>
            <dd className="text-2xl font-bold">
              {serviced ? (
                formatMoney(formatCents(totalCents), currency)
              ) : (
                <>
                  {formatMoney(estimate.itemSubtotal, currency)}
                  <span className="ml-1 align-middle text-xs font-normal text-muted-foreground">
                    + delivery
                  </span>
                </>
              )}
            </dd>
          </div>
          {quote && !serviced ? (
            <p className="mt-3 text-sm text-destructive">
              We don’t deliver to this address yet. Try a different address above.
            </p>
          ) : null}
        </div>
      </dl>
    </aside>
    </div>
  )
}

// methodTotalCents sums a quote's per-package fee for one method (falling back to standard per package).
function methodTotalCents(quote: DeliveryQuoteDTO | null, method: "standard" | "same_day"): number {
  if (!quote?.serviced) return 0
  return quote.packages.reduce((sum, pkg) => {
    const chosen = pkg.options.find((o) => o.method === method)
    const std = pkg.options.find((o) => o.method === "standard") ?? pkg.options[0]
    const opt = chosen ?? std
    return sum + (opt ? parseCents(opt.feeAmount) : 0)
  }, 0)
}

function OrderSummary({ currency, total }: { currency: string; total: string }) {
  return (
    <div className="flex items-baseline justify-between border-y py-3">
      <span className="text-sm text-muted-foreground">Total</span>
      <span className="text-lg font-semibold">{formatMoney(total, currency)}</span>
    </div>
  )
}
