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
import { updateAddress } from "@/lib/addresses/repo"
import {
  draftFrom,
  draftToRequest,
  sameInstructions,
  type InstructionsDraft,
} from "@/lib/delivery-instructions"
import { useCart } from "@/lib/cart-store"
import { computeCartTotals, formatCents, parseCents } from "@/lib/cart-totals"
import {
  carryDay,
  carrySlot,
  feesFor,
  needs,
  shapeOf,
  type DeliveryMethodChoice,
} from "@/lib/delivery-choice"
import { formatMoney } from "@/lib/money"
import { getStripe, paymentElementsOptions } from "@/lib/stripe"
import { capture } from "@/lib/telemetry"

import { AddressPicker } from "./AddressPicker"
import { BillingSection } from "./BillingSection"
import { DeliveryInstructions } from "./DeliveryInstructions"
import { DeliveryOptions } from "./DeliveryOptions"
import { PaymentStep } from "./PaymentStep"

type Step = "review" | "paying"

/**
 * The checkout flow (021, extending 019's US3; reworked 027). It walks three steps:
 *
 *   review (address)  →  delivery (per-package options)  →  paying (Stripe Payment Element)
 *
 * After the customer picks an address we QUOTE the server (`/commerce/v1/checkout/quote`) for the anonymous
 * per-package options; the delivery step prices them client-side for display only. At placement we send
 * the captured `quoteId` + the customer's per-package `selections` + the confirmed `excludedPackageKeys`
 * to `/commerce/v1/checkout/intent`. The server owns every fee (SC-004). A 409 means the captured quote is stale
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
  // 066 — what the shopper tells the driver. Starts from the selected address's SAVED default, and is
  // held here (not in the control) so it survives the move to the payment step and a failed payment.
  const [instructions, setInstructions] = useState<InstructionsDraft>(() =>
    draftFrom(
      (initialAddresses.find((a) => a.isDefault) ?? initialAddresses[0])?.defaultDeliveryInstructions,
    ),
  )
  // ⚠ OFF by default, and reset whenever the address changes: editing instructions for ONE order must
  // never rewrite the address's saved default unless the shopper asks (066 FR-014).
  const [saveInstructions, setSaveInstructions] = useState(false)
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
  // 047 US2: the shopper's delivery-method choice. The server applies the preference per package and
  // prices it (FR-044).
  const [method, setMethod] = useState<DeliveryMethodChoice>("standard")
  // 069: WHEN. A same-day slot is never selected for the shopper (FR-006); a standard day defaults to
  // the earliest on offer (FR-015). Both are held here so they survive the move to the payment step
  // and a failed payment (FR-007), and are carried across a re-quote only while still on offer.
  const [slotId, setSlotId] = useState<string | null>(null)
  const [standardDate, setStandardDate] = useState<string | null>(null)
  // Bumped to ask for a fresh quote for the SAME address — after a refused slot or day.
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
  }, [selectedId, quoteEpoch])

  // 069: what this quote lets the shopper choose. Same-day is offered when ANY delivery can go today
  // and a slot is open — a basket with one excepted shop is a mixed order, and says so (research R7).
  const shape = useMemo(() => shapeOf(quote), [quote])
  const sameDayOfferable = shape.sameDayOffered
  const need = needs(shape, method)

  // A new quote (a new address, or a re-quote after a refusal) keeps a choice only while it is still
  // on offer. ⚠ A slot that has gone is NOT replaced by another: nothing is selected, and the shopper
  // chooses again (FR-010). Skipped while there is no quote, so a refresh cannot wipe the choice.
  useEffect(() => {
    if (!quote) return
    if (!sameDayOfferable) setMethod("standard")
    setSlotId((prev) => carrySlot(quote, prev))
    setStandardDate((prev) => carryDay(quote, prev))
  }, [quote, sameDayOfferable])

  // The delivery fee is the sum of each package's option for the chosen method (falling back to standard
  // per package). GST-inclusive, already snapped up by the server. Distance / shop identity never appear
  // here (FR-018/033). ⚠ It does not depend on the slot or the day (069 FR-021).
  const deliveryCents = useMemo(() => feesFor(quote, method).totalCents, [quote, method])

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
    // ⚠ 066 FR-015: the draft is REPLACED by the new address's saved instructions, even if the shopper
    // had typed something. A note is about a place — "use the side gate" carried to a different
    // building is worse than an empty field.
    setInstructions(draftFrom(addresses.find((a) => a.id === id)?.defaultDeliveryInstructions))
    setSaveInstructions(false)
    capture({ name: "checkout_address_changed" })
  }

  // A new address added from the shipping picker → save it, select it as shipping, re-price (FR-005).
  function onShippingAddressAdded(created: AddressDTO) {
    appendAddress(created)
    setSelectedId(created.id)
    setInstructions(draftFrom(created.defaultDeliveryInstructions))
    setSaveInstructions(false)
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

  // 066 — what the selected address has SAVED, to tell "using my default" from "changed for this order".
  const savedInstructions = draftFrom(
    addresses.find((a) => a.id === selectedId)?.defaultDeliveryInstructions,
  )
  const instructionsDiffer = !sameInstructions(instructions, savedInstructions)

  // Pay is blocked until shipping is set (FR-007) and, when billing diverges, a billing address is
  // chosen (FR-012). Enforced at the review → delivery gate, before any payment.
  //
  // 069: and until a delivery time is chosen where one is needed. ⚠ The server refuses a same-day
  // order with no slot whatever this says (`slot_required`); this only keeps the button honest.
  const canContinue =
    !!selectedId &&
    (billingSameAsShipping || !!billingId) &&
    guestLines.length > 0 &&
    serviced &&
    (!need.slot || !!slotId) &&
    (!need.day || !!standardDate)

  /**
   * Place the order.
   *
   * 047: delivery is back, but standard-only for US1 — there is no per-package method choice yet, so the
   * shopper picks an address and pays. The server computes + captures the delivery fee at intent from the
   * destination zone + package weights (SC-004); the grand total it returns already includes it. A
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
      // 069 — the slot and the day the shopper chose. The server holds a place in the slot when it
      // accepts this, and refuses (409 + `code`) if either is no longer on offer.
      if (need.slot && slotId) body.sameDaySlotId = slotId
      if (need.day && standardDate) body.standardDate = standardDate
      // 066 — sent on EVERY placement, including as null: a shopper who cleared the note and pays
      // must not have an earlier attempt's draft delivered with the order.
      const deliveryInstructions = draftToRequest(instructions)
      body.deliveryInstructions = deliveryInstructions
      const res = await fetch("/api/checkout/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = (await res.json().catch(() => ({}))) as Partial<CreateCheckoutIntentResponse> & {
        error?: string
        code?: string
      }
      // 069 — the slot or the day could not be honoured. Nothing has been charged and no payment
      // exists. ⚠ The choice is NOT replaced: the shopper is brought back to the options, told
      // plainly, and shown what is on offer now (FR-009, FR-010).
      const refusal = res.status === 409 ? deliveryRefusal(data.code) : null
      if (refusal) {
        capture({ name: "checkout_delivery_choice_refused", props: { reason: refusal.reason } })
        if (refusal.reason !== "date_unavailable") setSlotId(null)
        setIntent(null)
        setStep("review")
        setError(refusal.message)
        setQuoteEpoch((n) => n + 1)
        return false
      }
      if (!res.ok || !data.clientSecret) {
        setError(data.error ?? "We couldn’t start payment. Please try again.")
        return false
      }
      if (need.slot && slotId && quote) {
        const slots = quote.sameDaySlots ?? []
        const index = slots.findIndex((s) => s.slotId === slotId)
        if (index >= 0) {
          capture({
            name: "checkout_delivery_slot_selected",
            props: {
              slotsOffered: slots.length,
              position: index + 1,
              hoursAhead: Math.max(0, Math.round((Date.parse(slots[index]!.startAt) - Date.now()) / 3_600_000)),
            },
          })
        }
      }
      if (need.day && standardDate && quote) {
        const index = (quote.standardDays ?? []).findIndex((d) => d.date === standardDate)
        if (index >= 0) {
          capture({ name: "checkout_delivery_date_selected", props: { daysAhead: index, wasDefault: index === 0 } })
        }
      }
      capture({
        name: "checkout_delivery_instructions_set",
        props: {
          handover: deliveryInstructions?.handover ?? "none",
          hasNote: !!deliveryInstructions?.note,
          fromSavedDefault: sameInstructions(instructions, savedInstructions),
        },
      })
      // 066 FR-014 — ONLY when asked, and only AFTER the order accepted them: a refused note must not
      // become an address's default. Best-effort: the order is already right, so a failure here costs
      // the shopper some retyping next time and must not stand between them and paying.
      if (saveInstructions && !sameInstructions(instructions, savedInstructions)) {
        const saved = await updateAddress(selectedId, { defaultDeliveryInstructions: deliveryInstructions })
        if (saved.ok) {
          setAddresses((prev) => prev.map((a) => (a.id === saved.address.id ? saved.address : a)))
          setSaveInstructions(false)
        }
        // A failure is deliberately silent: the flow is already moving to payment, the ORDER has the
        // instructions, and the checkbox stays ticked so a return to this step tries again.
      }
      setIntent(data as CreateCheckoutIntentResponse)
      setStep("paying")
      return true
    } finally {
      setBusy(false)
    }
  }

  if (step === "paying" && intent) {
    // ⚠ 051: the payment step carries the amount and NOTHING else — no basket recap, no address, no
    // delivery row (FR-003). The `OrderSummary` strip that used to sit above the form is gone with it,
    // along with `PaymentForm`; the amount now lives in the step's own pay rail.
    return (
      <Elements stripe={getStripe()} options={paymentElementsOptions(intent.clientSecret)}>
        {/* 069: `renewHold` re-runs the intent when the same-day place has lapsed. The server either
            holds it again (same order, same payment) or refuses — and a refusal returns here. */}
        <PaymentStep intent={intent} onBack={() => setStep("review")} renewHold={placeOrder} />
      </Elements>
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
          {selectedId && (
            <div className="mt-6">
              <DeliveryInstructions value={instructions} onChange={setInstructions} disabled={busy}>
                {/* Offered only when there is something to save that the address does not already
                    hold — an always-present checkbox reads as a chore. */}
                {instructionsDiffer && (
                  <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
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
        </section>

        {quote?.serviced && (
          <DeliveryOptions
            quote={quote}
            method={method}
            onMethodChange={setMethod}
            slotId={slotId}
            onSlotChange={setSlotId}
            standardDate={standardDate}
            onStandardDateChange={setStandardDate}
            currency={currency}
            disabled={busy}
          />
        )}

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
        {/* 069: the choice itself lives in the Delivery section; the summary states what was chosen
            and what it costs. The fee updates live; the server re-prices and never trusts a client fee. */}
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
                  {method === "same_day" && sameDayOfferable ? "Same-day" : "Standard"} ·{" "}
                  {formatMoney(formatCents(deliveryCents), currency)}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </dd>
          </div>
        </div>
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

/** The three reasons the server refuses a checkout over the delivery choice (069), in our own words. */
function deliveryRefusal(
  code: string | undefined,
): { reason: "slot_unavailable" | "date_unavailable" | "slot_required"; message: string } | null {
  switch (code) {
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
