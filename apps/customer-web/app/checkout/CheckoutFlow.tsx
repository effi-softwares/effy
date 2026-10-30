"use client"

import { Elements } from "@stripe/react-stripe-js"
import { ArrowLeft, CreditCard, Lock } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"

import {
  AGE_RESTRICTED_CART_SENTENCE,
  COVERAGE_REFUSAL_SENTENCE,
  DELIVERY_FEE_CHANGED_CODE,
  PROMOTIONS_CHANGED_CODE,
  DELIVERY_FEE_WORDS,
  DELIVERY_WINDOW_WORDS,
  type AddressDTO,
  type CreateCheckoutIntentResponse,
  type DeliveryQuoteDTO,
} from "@effy/shared-types"

import { CatalogImage } from "@/components/storefront/CatalogImage"
import { DeliveryFeeLines } from "@/components/delivery/DeliveryFeeLines"
import { FreeDeliveryHint } from "@/components/delivery/FreeDeliveryHint"
import { ActionButton } from "@/components/storefront/actions"
import { Alert } from "@/components/ui/alert"
import { setCheckoutStep } from "@/lib/checkout-step"
import { updateAddress } from "@/lib/addresses/repo"
import {
  draftFrom,
  draftToRequest,
  sameInstructions,
  type InstructionsDraft,
} from "@/lib/delivery-instructions"
import { useCart, useCartMirror } from "@/lib/cart-store"
import { computeCartTotals, formatCents, parseCents } from "@/lib/cart-totals"
import {
  carryWindow,
  chosenFee,
  courierOf,
  dayOffset,
  deliveryTypeOf,
  effyWindowsOf,
  isAsap,
  isFreeDelivery,
  promiseOf,
  windowOf,
  type DeliveryChoice,
} from "@/lib/delivery-choice"
import { formatMoney } from "@/lib/money"
import { getStripe, paymentElementsOptions } from "@/lib/stripe"
import { capture } from "@/lib/telemetry"

import { AgeBadge } from "@/components/storefront/AgeBadge"
import { Bone, Loading } from "@/components/ui/skeletons"

import { AddressPicker } from "./AddressPicker"
import { DeliveryStepSkeleton } from "./CheckoutSkeleton"
import { BillingSection } from "./BillingSection"
import { DeliveryInstructions } from "./DeliveryInstructions"
import { CourierDelivery } from "./CourierDelivery"
import { EffyWindowOptions } from "./EffyWindowOptions"
import { PaymentStep } from "./PaymentStep"
import { PointsControl } from "./_components/PointsControl"
import { splitTotal } from "./_components/points"

type Step = "review" | "paying"

/**
 * The checkout flow: choose the shipping address (saved addresses, default pre-selected, add inline) and
 * billing ("same as shipping" by default), take the delivery quote, choose the delivery, then pay with
 * the Stripe Payment Element. The server owns every fee: the intent carries the delivery choice and the
 * totals the shopper saw, and a 409 means they changed (re-quote and show again, never retry blindly).
 * Changing the shipping address re-quotes.
 */
export function CheckoutFlow({ initialAddresses }: { initialAddresses: AddressDTO[] }) {
  const router = useRouter()
  const guestLines = useCart()
  // The mirror is what the UI reads, and nothing here empties it - the cart is cleared only when an
  // order is actually paid for. The estimate and the "has items" gate read it live; the amount is
  // never taken from it, because the platform computes every figure that is charged.
  const estimate = useMemo(() => computeCartTotals(guestLines), [guestLines])
  const currency = guestLines[0]?.currency ?? "AUD"

  const [addresses, setAddresses] = useState<AddressDTO[]>(initialAddresses)
  // Pre-select the shipping address: the default, else - when none is default - the first of
  // the default-first list, a deterministic most-recent choice.
  const [selectedId, setSelectedId] = useState<string | null>(
    initialAddresses.find((a) => a.isDefault)?.id ?? initialAddresses[0]?.id ?? null,
  )
  // What the shopper tells the driver. Starts from the selected address's saved default, and is
  // held here (not in the control) so it survives the move to the payment step and a failed payment.
  const [instructions, setInstructions] = useState<InstructionsDraft>(() =>
    draftFrom(
      (initialAddresses.find((a) => a.isDefault) ?? initialAddresses[0])?.defaultDeliveryInstructions,
    ),
  )
  // Off by default, and reset whenever the address changes: editing instructions for one order must
  // never rewrite the address's saved default unless the shopper asks.
  const [saveInstructions, setSaveInstructions] = useState(false)
  // Billing defaults to "same as shipping"; `billingId` is only meaningful while the toggle is
  // off, and is discarded when it returns ON.
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true)
  const [billingId, setBillingId] = useState<string | null>(null)
  const [step, setStep] = useState<Step>("review")
  const [intent, setIntent] = useState<CreateCheckoutIntentResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // The delivery quote for the chosen address - serviceability + the standard fee, shown before
  // pay (no drip). The server owns the fee; this display never sends one. Re-fetched when the shipping
  // address changes.
  const [quote, setQuote] = useState<DeliveryQuoteDTO | null>(null)
  const [quoting, setQuoting] = useState(false)
  // The one window for the order. Never chosen for the shopper - a window is a promise about
  // when someone will be home; kept across steps and a failed payment while it is
  // still offered; dropped when the address changes - nothing chosen for one address is
  // silently carried to another.
  const [chosenWindow, setChosenWindow] = useState<DeliveryChoice | null>(null)
  // Where the order is going, as far as delivery cares: the address and its postcode. Who
  // delivers, the fee and the windows are all decided from the postcode, so a different one under the
  // same address id is a different destination and must be re-decided like any other.
  const selectedPostcode = addresses.find((a) => a.id === selectedId)?.postalCode ?? null
  useEffect(() => {
    setChosenWindow(null)
  }, [selectedId, selectedPostcode])
  // Bumped to ask for a fresh quote for the same address - after a refused slot or day.
  const [quoteEpoch, setQuoteEpoch] = useState(0)

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
  }, [selectedId, selectedPostcode, quoteEpoch])

  // A new quote (a new address, or a re-quote after a refusal) keeps the window only while it is
  // still on offer. One that has gone is not replaced by another: nothing is selected, and the
  // shopper chooses again. Skipped while there is no quote, so a refresh cannot wipe it.
  //
  // "Standard" is the default: the first quote for a destination starts with it chosen when
  // it is offered. Once per destination - a re-quote after a refused choice never falls back to it.
  const defaultedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!quote) return
    const destination = `${selectedId}|${selectedPostcode}`
    const first = defaultedFor.current !== destination
    defaultedFor.current = destination
    setChosenWindow((prev) => carryWindow(quote, prev) ?? (first && effyWindowsOf(quote)?.asap ? { asap: true } : null))
    // The destination is read at the moment its quote arrives; it is not a reason to run again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote])

  // The windows Effy offers, when the quote carries them. Told once per reason when there is
  // nothing to choose (lib/telemetry.ts).
  const effyWindows = useMemo(() => effyWindowsOf(quote), [quote])
  const windowsUnavailable = effyWindows?.unavailable ?? null
  useEffect(() => {
    if (windowsUnavailable) capture({ name: "checkout_windows_unavailable", props: { reason: windowsUnavailable } })
  }, [windowsUnavailable])

  // Who delivers, as this page is showing it: a courier, or Effy. Sent back on the intent,
  // which refuses if it is not what applies by then. Told once per distinct answer (lib/telemetry.ts).
  const courier = useMemo(() => courierOf(quote), [quote])
  const deliveryType = useMemo(() => deliveryTypeOf(quote), [quote])
  const typeShown = deliveryType ? `${deliveryType}|${courier?.reason ?? "in_coverage"}` : null
  useEffect(() => {
    if (!typeShown) return
    const [type, reason] = typeShown.split("|") as ["effy" | "courier", "in_coverage" | "out_of_coverage" | "no_window"]
    capture({ name: "checkout_delivery_type_shown", props: { type, reason } })
  }, [typeShown])

  // One fee for the order, as the server priced it: the courier's, or the chosen window's.
  // Lines and a total; no distance, weight or plan ever reaches here. Null until a window is
  // chosen - there is nothing to show yet.
  const deliveryFee = useMemo(() => chosenFee(quote, chosenWindow), [quote, chosenWindow])
  const deliveryCents = deliveryFee ? parseCents(deliveryFee.totalAmount) : 0
  // What promotions take off: the goods (from the server cart) and this option's delivery offer.
  const mirror = useCartMirror()
  const goodsDiscountCents = parseCents(mirror.discountAmount || "0")
  const deliveryOfferCents = deliveryFee?.promotionAmount ? parseCents(deliveryFee.promotionAmount) : 0

  // Once per fee the shopper is shown: whether it was free, had a small-order fee, or a
  // surcharge. Booleans only (lib/telemetry.ts).
  const feeShape = deliveryFee
    ? `${isFreeDelivery(deliveryFee)}|${deliveryFee.lines.some((l) => l.kind === "small_order")}|${deliveryFee.lines.some((l) => l.kind === "window_surcharge")}`
    : null
  useEffect(() => {
    if (!feeShape) return
    const [free, small, surcharge] = feeShape.split("|").map((v) => v === "true")
    capture({ name: "delivery_fee_viewed", props: { free: free!, small_order: small!, surcharge: surcharge! } })
  }, [feeShape])

  const serviced = quote?.serviced === true
  const totalCents = Math.max(0, parseCents(estimate.itemSubtotal) - goodsDiscountCents) + deliveryCents - deliveryOfferCents

  // Points. ON by default at the most they can use; `chosenPoints` null = "the most".
  const [usePoints, setUsePoints] = useState(true)
  const [chosenPoints, setChosenPoints] = useState<number | null>(null)
  const split = useMemo(
    () => splitTotal(quote?.points, totalCents, usePoints ? (chosenPoints ?? Number.MAX_SAFE_INTEGER) : 0),
    [quote?.points, totalCents, usePoints, chosenPoints],
  )

  // No cart snapshot at checkout: the platform's cart is authoritative, and the device cart was merged at sign-in.

  /** Reflect a newly created address into the shared saved-address list (dedup on id). */
  function appendAddress(created: AddressDTO) {
    setAddresses((prev) => (prev.some((a) => a.id === created.id) ? prev : [...prev, created]))
  }

  // Switch the shipping address (a per-order choice - never the saved default, FR-006). Invalidate the
  // captured quote so delivery/amount re-price for the new destination on the next continue.
  function selectShipping(id: string) {
    if (id === selectedId) return
    setSelectedId(id)
    // The draft is replaced by the new address's saved instructions, even if the shopper
    // had typed something. A note is about a place - "use the side gate" carried to a different
    // building is worse than an empty field.
    setInstructions(draftFrom(addresses.find((a) => a.id === id)?.defaultDeliveryInstructions))
    setSaveInstructions(false)
    capture({ name: "checkout_address_changed" })
  }

  // A new address added from the shipping picker → save it, select it as shipping, re-price.
  function onShippingAddressAdded(created: AddressDTO) {
    appendAddress(created)
    setSelectedId(created.id)
    setInstructions(draftFrom(created.defaultDeliveryInstructions))
    setSaveInstructions(false)
    capture({ name: "checkout_address_added" })
  }

  // Switch the billing address (toggle already off). A billing distinct from shipping is a divergence.
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

  // The "same as shipping" toggle. Turning it back ON discards any divergent billing choice.
  function toggleBillingSame(value: boolean) {
    setBillingSameAsShipping(value)
    if (value) setBillingId(null)
  }

  // What the selected address has saved, to tell "using my default" from "changed for this order".
  const savedInstructions = draftFrom(
    addresses.find((a) => a.id === selectedId)?.defaultDeliveryInstructions,
  )
  const instructionsDiffer = !sameInstructions(instructions, savedInstructions)

  // Pay is blocked until shipping is set and, when billing diverges, a billing address is
  // chosen. Enforced at the review → delivery gate, before any payment.
  //
  // And until a delivery time is chosen where one is needed. The server refuses a same-day
  // order with no slot whatever this says (`slot_required`); this only keeps the button honest.
  const canContinue =
    !!selectedId &&
    (billingSameAsShipping || !!billingId) &&
    guestLines.length > 0 &&
    serviced &&
    // A courier order has nothing to choose; an Effy order needs its one window.
    (courier ? true : !!effyWindows && !effyWindows.unavailable && !!chosenWindow)

  /**
   * Place the order.
   *
   * Delivery is back, but standard-only for US1 - there is no per-package method choice yet, so the
   * shopper picks an address and pays. The server computes + captures the delivery fee at intent from the
   * destination zone + package weights; the grand total it returns already includes it. A
   * not-serviceable address is refused server-side (ErrNotServiceable) and blocked here (canContinue).
   */
  async function placeOrder(): Promise<boolean> {
    if (!selectedId) {
      setError("Choose a delivery address.")
      return false
    }
    if (!billingSameAsShipping && !billingId) {
      setError("Choose a billing address.")
      return false
    }
    setBusy(true)
    setError(null)
    try {
      // Send `billingAddressId` only when the customer diverged - the toggle is off and the chosen
      // billing differs from shipping. Same-as / equal → omit it so the server stores null.
      const body: Record<string, unknown> = { addressId: selectedId }
      if (!billingSameAsShipping && billingId && billingId !== selectedId) {
        body.billingAddressId = billingId
      }
      // Who delivers, as shown. A courier order is refused without it; one that says "courier"
      // for an address Effy now delivers to is refused too (409 `delivery_type_changed`).
      if (deliveryType) body.deliveryType = deliveryType
      if (courier) {
        // Nothing to choose: no window, no slot, no day.
      } else if (isAsap(chosenWindow)) {
        // "as soon as possible": no window and no day.
        body.deliveryPromise = "asap"
      } else if (chosenWindow) {
        // One window for the order. The server works out same-day or standard from its date,
        // holds a place on that day, and refuses (409 + `code`) if it is no longer on offer.
        // A later day with no time is this too: the day's Any-time window.
        body.deliveryWindow = chosenWindow
      }
      // Sent on every placement, including as null: a shopper who cleared the note and pays
      // must not have an earlier attempt's draft delivered with the order.
      const deliveryInstructions = draftToRequest(instructions)
      body.deliveryInstructions = deliveryInstructions
      // The points the shopper chose. The server re-decides the split and refuses what it cannot
      // honour; it never quietly changes the number.
      if (split.pointsUsed > 0) body.pointsToUse = split.pointsUsed
      // The delivery total this page is showing. If the server would now charge another (a new
      // fee plan, a basket that crossed a threshold), it refuses and nothing is written or charged.
      if (deliveryFee) body.shownDeliveryAmount = deliveryFee.totalAmount
      // The promotions total this page shows; a different one is refused before anything is charged.
      body.expectedDiscount = formatCents(goodsDiscountCents + deliveryOfferCents)
      const res = await fetch("/api/checkout/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = (await res.json().catch(() => ({}))) as Partial<CreateCheckoutIntentResponse> & {
        error?: string
        code?: string
      }
      // The window could not be honoured. Nothing has been charged and no payment
      // exists. The choice is not replaced: the shopper is brought back to the options, told
      // plainly, and shown what is on offer now.
      // Who delivers is not what this page showed (the address's coverage changed, or the last
      // window went and courier is offered instead). Nothing was written or charged. The fresh quote
      // re-draws the delivery section - a different one - and nothing chosen for the old one is kept.
      if (res.status === 409 && data.code === "delivery_type_changed") {
        capture({ name: "checkout_delivery_type_changed", props: {} })
        setChosenWindow(null)
        setIntent(null)
        setStep("review")
        setError(DELIVERY_TYPE_CHANGED_MESSAGE)
        setQuoteEpoch((n) => n + 1)
        return false
      }
      const refusal = res.status === 409 ? deliveryRefusal(data.code) : null
      if (refusal) {
        capture({ name: "checkout_delivery_choice_refused", props: { reason: refusal.reason } })
        // The window is never replaced: the re-quote keeps it only if it is still offered.
        if (refusal.reason !== "slot_required") setChosenWindow(null)
        setIntent(null)
        setStep("review")
        setError(refusal.message)
        setQuoteEpoch((n) => n + 1)
        return false
      }
      // The delivery total changed between the quote and the pay button. Nothing was charged.
      // The new total is shown and the shopper presses pay again; it is never charged unseen.
      if (res.status === 409 && data.code === DELIVERY_FEE_CHANGED_CODE) {
        capture({ name: "checkout_delivery_fee_changed", props: {} })
        setIntent(null)
        setStep("review")
        setError(DELIVERY_FEE_WORDS.feeChanged)
        setQuoteEpoch((n) => n + 1)
        return false
      }
      // An offer changed or its last use went. Nothing was charged; the new total is shown.
      if (res.status === 409 && data.code === PROMOTIONS_CHANGED_CODE) {
        capture({ name: "checkout_promotions_changed", props: {} })
        setIntent(null)
        setStep("review")
        setError("One of your offers changed or is no longer available. Check your new total before you pay.")
        setQuoteEpoch((n) => n + 1)
        return false
      }
      // A points refusal. Nothing was charged; the shopper is shown what they can do now.
      const pointsMessage = pointsRefusal(data.code)
      if (pointsMessage) {
        // A changed balance is re-read (the quote carries it); a too-large number is left for the
        // shopper to lower - the page's estimate cannot see a promo discount the server applied.
        if (data.code === "points_balance_changed") setChosenPoints(null)
        else setChosenPoints(split.pointsUsed)
        setError(pointsMessage)
        setQuoteEpoch((n) => n + 1)
        return false
      }
      // Points paid for all of it: the order is already placed. Straight to the receipt.
      if (res.ok && data.paidWithPoints && data.orderId) {
        capture({ name: "checkout_paid_with_points", props: { share: "all" } })
        window.location.assign(`/checkout/complete?order=${data.orderId}`)
        return true
      }
      if (!res.ok || !data.clientSecret) {
        setError(data.error ?? "We couldn’t start payment. Please try again.")
        return false
      }
      const promise = promiseOf(quote, chosenWindow)
      if (effyWindows && promise) {
        const w = windowOf(chosenWindow)
        const offset = w ? dayOffset(effyWindows, w.date) : -1
        capture({ name: "checkout_window_selected", props: { section: offset === 0 ? "same_day" : "standard", day_offset: offset, promise } })
      }
      capture({
        name: "checkout_delivery_instructions_set",
        props: {
          handover: deliveryInstructions?.handover ?? "none",
          hasNote: !!deliveryInstructions?.note,
          fromSavedDefault: sameInstructions(instructions, savedInstructions),
        },
      })
      // Only when asked, and only after the order accepted them: a refused note must not
      // become an address's default. Best-effort: the order is already right, so a failure here costs
      // the shopper some retyping next time and must not stand between them and paying.
      if (saveInstructions && !sameInstructions(instructions, savedInstructions)) {
        const saved = await updateAddress(selectedId, { defaultDeliveryInstructions: deliveryInstructions })
        if (saved.ok) {
          setAddresses((prev) => prev.map((a) => (a.id === saved.address.id ? saved.address : a)))
          setSaveInstructions(false)
        }
        // A failure is deliberately silent: the flow is already moving to payment, the order has the
        // instructions, and the checkbox stays ticked so a return to this step tries again.
      }
      if ((data.pointsUsed ?? 0) > 0) capture({ name: "checkout_paid_with_points", props: { share: "part" } })
      setIntent(data as CreateCheckoutIntentResponse)
      setStep("paying")
      return true
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => setCheckoutStep(step === "paying" ? 2 : 1), [step])

  if (step === "paying" && intent) {
    // The payment step carries the amount and nothing else - no basket recap, no address, no
    // delivery row. The `OrderSummary` strip that used to sit above the form is gone with it,
    // along with `PaymentForm`; the amount now lives in the step's own pay rail.
    return (
      <Elements stripe={getStripe()} options={paymentElementsOptions(intent.clientSecret)}>
        {/* `renewHold` re-runs the intent when the same-day place has lapsed. The server either
            holds it again (same order, same payment) or refuses - and a refusal returns here. */}
        <PaymentStep intent={intent} onBack={() => setStep("review")} renewHold={placeOrder} />
      </Elements>
    )
  }

  return (
    // Two columns above `lg`, with the summary sticky, so the amount payable never
    // scrolls away from the form it belongs to. 084: each step is its own card, numbered as the
    // reference numbers them.
    // `grid-cols-1` is not decoration: with no template the one column is `auto`, which grows to its
    // widest unbreakable row and takes every card past the screen edge with it.
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <div className="min-w-0 space-y-6">
        <section className="rounded-lg border bg-card p-5 shadow-xs sm:p-6">
          <h2 className="text-lg font-semibold">
            <span aria-hidden="true">1. </span>
            Delivery address
          </h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">Where should we bring your order?</p>
          <AddressPicker
            addresses={addresses}
            selectedId={selectedId}
            onSelect={selectShipping}
            onAddressAdded={onShippingAddressAdded}
            idPrefix="shipping"
            busy={busy}
            showCoverage
          />
        </section>

        {/* Exactly one of these, decided by the quote: a courier address has nothing to choose, an
            Effy address has windows, and an unserviced one says the one refusal sentence. */}
        {courier ? (
          <div className="rounded-lg border bg-card p-5 shadow-xs sm:p-6">
            <CourierDelivery courier={courier} currency={currency} />
          </div>
        ) : effyWindows ? (
          <div className="rounded-lg border bg-card p-5 shadow-xs sm:p-6">
            <EffyWindowOptions windows={effyWindows} chosen={chosenWindow} onChoose={setChosenWindow} currency={currency} disabled={busy} />
          </div>
        ) : quoting && selectedId ? (
          // Step 2 keeps its place while the quote is worked out, rather than appearing once it answers.
          <DeliveryStepSkeleton />
        ) : null}

        {selectedId && (
          <div className="rounded-lg border bg-card p-5 shadow-xs sm:p-6">
            <DeliveryInstructions step={3} value={instructions} onChange={setInstructions} disabled={busy}>
              {instructionsDiffer && (
                <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 rounded-sm accent-primary"
                    checked={saveInstructions}
                    disabled={busy}
                    onChange={(e) => setSaveInstructions(e.target.checked)}
                  />
                  Save to this address for next time
                </label>
              )}
            </DeliveryInstructions>
          </div>
        )}

        {serviced && quote?.points ? (
          <div className="rounded-lg border bg-card p-5 shadow-xs sm:p-6">
            <PointsControl
              points={quote.points}
              totalCents={totalCents}
              on={usePoints}
              onToggle={(on) => {
                setUsePoints(on)
                capture({ name: "checkout_points_toggled", props: { on } })
              }}
              chosen={chosenPoints}
              onChosen={setChosenPoints}
              currency={currency}
              disabled={busy}
            />
          </div>
        ) : null}

        <div className="rounded-lg border bg-card p-5 shadow-xs sm:p-6">
          <BillingSection
            sameAsShipping={billingSameAsShipping}
            onSameAsShippingChange={toggleBillingSame}
            addresses={addresses}
            billingId={billingId}
            onBillingSelect={selectBilling}
            onAddressAdded={onBillingAddressAdded}
          />
        </div>

        {guestLines.length > 0 && (
          <section className="rounded-lg border bg-card p-5 shadow-xs sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold">Review your order</h2>
              <a href="/cart" className="text-sm font-medium text-primary underline underline-offset-4">
                Edit cart
              </a>
            </div>
            <ul className="mt-2 divide-y">
              {guestLines.map((line) => (
                <li key={line.variantId} className="flex items-center gap-4 py-3">
                  <div className="relative size-12 shrink-0 overflow-hidden rounded-md bg-muted">
                    {line.imageUrl ? (
                      <CatalogImage src={line.imageUrl} widths={line.imageWidths} alt="" fill sizes="3rem" className="object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
                      <span className="truncate">{line.name}</span>
                      {line.ageRestricted ? <AgeBadge /> : null}
                    </p>
                    {/* The size chosen, beside the quantity. */}
                    <p className="text-xs text-muted-foreground">
                      {line.variantLabel ? `${line.variantLabel} · ` : ""}Qty {line.quantity}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatMoney(formatCents(parseCents(line.unitPriceAmount) * line.quantity), line.currency)}
                  </span>
                </li>
              ))}
            </ul>
            {guestLines.some((l) => l.ageRestricted) ? (
              <p className="mt-2 text-sm text-muted-foreground">{AGE_RESTRICTED_CART_SENTENCE}</p>
            ) : null}
          </section>
        )}

        <div className="space-y-4">
          {error && (
            <Alert variant="destructive" title="We couldn't continue">
              {error}
            </Alert>
          )}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <ActionButton type="button" variant="outline" onClick={() => router.push("/cart")} disabled={busy} size="lg">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back
            </ActionButton>
            <ActionButton type="button" onClick={placeOrder} disabled={busy || !canContinue} size="lg">
              <CreditCard className="size-4" aria-hidden="true" />
              Continue to payment
            </ActionButton>
          </div>
        </div>
      </div>

      <aside className="min-w-0 rounded-lg border bg-card p-5 shadow-xs sm:p-6 lg:sticky lg:top-24">
        <h2 className="font-semibold">Order summary</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <dt>Items</dt>
            <dd className="tabular-nums">{formatMoney(estimate.itemSubtotal, currency)}</dd>
          </div>
          {(mirror.promotions ?? []).filter((p) => p.goodsAmount !== "0.00").map((p) => (
            <div key={p.promotionId} className="flex items-center justify-between text-brand">
              <dt>
                {p.headline}
                {p.code ? ` (${p.code})` : ""}
              </dt>
              <dd className="tabular-nums">−{formatMoney(p.goodsAmount, currency)}</dd>
            </div>
          ))}
          {deliveryOfferCents > 0 ? (
            <div className="flex items-center justify-between text-brand">
              <dt>Delivery offer</dt>
              <dd className="tabular-nums">−{formatMoney(formatCents(deliveryOfferCents), currency)}</dd>
            </div>
          ) : null}
          {serviced && !quoting && deliveryFee && deliveryFee.lines.length > 0 ? (
            <DeliveryFeeLines fee={deliveryFee} currency={currency} />
          ) : (
            <div className="flex items-center justify-between">
              <dt>Delivery</dt>
              <dd>
                {!selectedId ? (
                  <span className="text-muted-foreground">Select an address</span>
                ) : quoting ? (
                  <Loading label="Working out the delivery fee">
                    <Bone className="w-16" />
                  </Loading>
                ) : quote && !serviced ? (
                  <span className="font-medium">Not available</span>
                ) : serviced && !deliveryFee ? (
                  <span className="text-muted-foreground">Choose a delivery time</span>
                ) : serviced ? (
                  <span className="tabular-nums">{formatMoney(formatCents(deliveryCents), currency)}</span>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </dd>
            </div>
          )}
          {serviced && !quoting ? (
            <FreeDeliveryHint
              remainingAmount={quote?.freeDeliveryRemainingAmount}
              freeApplied={isFreeDelivery(deliveryFee)}
              currency={currency}
            />
          ) : null}
          <div className="border-t pt-3">
            <div className="flex items-baseline justify-between">
              <dt className="text-base font-semibold">Total</dt>
              <dd className="text-lg font-semibold tabular-nums">
                {serviced ? (
                  formatMoney(formatCents(totalCents), currency)
                ) : (
                  <>
                    {formatMoney(estimate.itemSubtotal, currency)}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">+ delivery</span>
                  </>
                )}
              </dd>
            </div>
            {serviced && split.pointsUsed > 0 ? (
              <dl className="mt-3 space-y-2">
                <div className="flex items-center justify-between text-primary">
                  <dt>Points ({split.pointsUsed.toLocaleString("en-AU")})</dt>
                  <dd className="tabular-nums">−{formatMoney(formatCents(split.pointsCents), currency)}</dd>
                </div>
                <div className="flex items-center justify-between font-semibold">
                  <dt>To pay by card</dt>
                  <dd className="tabular-nums">{formatMoney(formatCents(split.cardCents), currency)}</dd>
                </div>
              </dl>
            ) : null}
            {/* The refusal, in its one sentence, where the amount would have been. */}
            {quote && !serviced ? (
              <Alert variant="destructive" live={false} className="mt-3">
                <span data-testid="checkout-coverage-refusal">{COVERAGE_REFUSAL_SENTENCE}</span>
              </Alert>
            ) : null}
          </div>
        </dl>
        <p className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Lock aria-hidden="true" className="size-4" />
          Payments are processed securely by Stripe
        </p>
      </aside>
    </div>
  )
}

/** Who delivers changed under the shopper. Says what to do, and that nothing was taken. */
export const DELIVERY_TYPE_CHANGED_MESSAGE =
  "How this order is delivered has changed. Please check the delivery option below - you haven't been charged."

/** The three reasons the server refuses a checkout over the delivery choice, in our own words. */
function deliveryRefusal(
  code: string | undefined,
): { reason: "slot_unavailable" | "date_unavailable" | "slot_required" | "no_windows_available"; message: string } | null {
  switch (code) {
    // The one sentence, from the one place it is written.
    case "no_windows_available":
      return { reason: code, message: DELIVERY_WINDOW_WORDS.noWindows }
    case "slot_unavailable":
      return { reason: code, message: "That delivery time is no longer available. Please choose another." }
    case "slot_required":
      return { reason: code, message: "Choose a delivery time to continue." }
    case "date_unavailable":
      return { reason: code, message: "That delivery day is no longer available. Please choose another." }
    default:
      return null
  }
}

/** A points refusal from the intent, in our own words; null when it is not one. */
function pointsRefusal(code: string | undefined): string | null {
  switch (code) {
    case "points_balance_changed":
      return "Your points balance has changed. We’ve updated how many you can use - please check and continue."
    case "points_exceed_total":
      return "That’s more points than this order costs after any discount. Use fewer points and continue."
    case "points_card_remainder_too_small":
      return "Use a few fewer points so there’s at least 50¢ left to pay by card, or enough points to cover it all."
    case "payment_in_progress":
      return "A payment for this order is already in progress. Please check your orders before trying again."
    default:
      return null
  }
}
