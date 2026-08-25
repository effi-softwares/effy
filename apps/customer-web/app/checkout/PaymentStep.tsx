"use client"

import { useElements, useStripe } from "@stripe/react-stripe-js"
import { CardNumberElement } from "@stripe/react-stripe-js"
import { ArrowLeft, Lock } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import type { CreateCheckoutIntentResponse } from "@effy/shared-types"

import { ActionButton } from "@/components/storefront/actions"
import { formatMoney } from "@/lib/money"

import { CardFields, useCardFieldState } from "./_payment/CardFields"
import { confirmCardPayment } from "./_payment/confirm"

/**
 * THE PAYMENT STEP (051 US1).
 *
 * ⚠ IT CARRIES NO ORDER CONTENT. No basket lines, no delivery address, no delivery-speed control
 * (FR-003). The shopper confirmed all of it on the step before, and restating it here invites a second
 * review instead of a payment. The ONE order-derived thing on the page is the amount — you cannot ask
 * someone to pay without saying how much, and the exact figure has to be shown before payment.
 *
 * ⚠ WIDTH COMES FROM `container` AND NOTHING ELSE. No `max-w`, no `mx-auto` on the content: the repo's
 * own `@utility container` (80rem, 16px gutter, 24px at `sm`) sets the page, and the measure comes from
 * the grid below it. The pay rail is held by a hairline rule rather than a bordered box — Principle V's
 * "no card layouts" rule applies here as everywhere.
 */
export function PaymentStep({
  intent,
  onBack,
}: {
  intent: CreateCheckoutIntentResponse
  onBack: () => void
}) {
  const router = useRouter()
  const stripe = useStripe()
  const elements = useElements()
  const card = useCardFieldState()

  const [saveCard, setSaveCard] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const amount = formatMoney(intent.grandTotalAmount, intent.currency)
  const ready = Boolean(stripe && elements) && card.complete

  async function pay() {
    if (!stripe || !elements || busy) return
    const cardNumberElement = elements.getElement(CardNumberElement)
    if (!cardNumberElement) return

    setBusy(true)
    setNotice(null)
    try {
      const outcome = await confirmCardPayment({
        stripe,
        clientSecret: intent.clientSecret,
        cardNumberElement,
        billingDetails: intent.billingDetails ?? null,
        saveCard,
      })

      switch (outcome.kind) {
        case "succeeded":
        case "processing":
          // ⚠ `processing` goes to the receipt too, and that is correct: the receipt reads the
          // webhook-authoritative order state and can say "we're confirming your payment". What it must
          // NOT do is announce success here (FR-040).
          router.push(`/checkout/complete?order=${intent.orderId}`)
          return
        case "requires_action":
          // The provider drives the bank's challenge and returns to `return_url`; nothing to do.
          return
        case "failed":
          setNotice(outcome.message)
          return
      }
    } finally {
      // ⚠ ALWAYS. The previous implementation cleared `busy` only on a validation error, so the control
      // stayed disabled and reading "Processing…" through the navigation and the receipt's two server
      // round trips — and forever if that navigation failed (research R12 D2, FR-041).
      setBusy(false)
    }
  }

  return (
    <div className="container pt-10">
      <button
        type="button"
        onClick={onBack}
        disabled={busy}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to checkout
      </button>

      <div className="mt-6 grid items-start gap-16 lg:grid-cols-[minmax(0,1fr)_448px]">
        <div className="flex flex-col gap-6">
          <section aria-labelledby="pay-by-card">
            <h2 id="pay-by-card" className="sr-only">
              Pay by card
            </h2>
            <CardFields state={card} />
          </section>

          <label className="flex w-fit cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={saveCard}
              onChange={(e) => setSaveCard(e.target.checked)}
              className="size-[18px] rounded-[5px] accent-foreground"
            />
            <span className="text-[13px]">Save this card for next time</span>
          </label>
        </div>

        {/* The pay rail. A border-left and space hold it — not a card (Principle V). */}
        <aside className="flex flex-col gap-6 lg:sticky lg:top-[88px] lg:border-l lg:pl-12">
          <div>
            <span className="block text-xs font-medium uppercase tracking-[0.09em] text-muted-foreground">
              Total due
            </span>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-[46px] font-semibold leading-none tracking-[-0.035em]">
                {amount}
              </span>
              <span className="text-sm font-medium text-muted-foreground">{intent.currency}</span>
            </div>
            <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
              Includes GST and delivery. This is the exact amount we will charge.
            </p>
          </div>

          {notice ? (
            <p role="alert" className="text-sm text-destructive">
              {notice}
            </p>
          ) : null}

          <div>
            <ActionButton
              type="button"
              onClick={pay}
              disabled={!ready || busy}
              size="lg"
              className="h-14 w-full text-base"
            >
              {busy ? "Paying…" : `Pay ${amount}`}
            </ActionButton>
            <p className="mt-3.5 flex items-center justify-center gap-2 text-center text-[13px] leading-relaxed text-muted-foreground">
              <Lock className="size-3.5 shrink-0" aria-hidden="true" />
              Encrypted end to end. Effy never sees or stores your card number.
            </p>
          </div>

          {/* Point-of-sale legal links — new tab, so the payment funnel is never lost. */}
          <p className="text-center text-xs leading-[1.7] text-muted-foreground">
            By placing your order you agree to our{" "}
            <a href="/legal/terms-of-service" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              Terms of Service
            </a>
            ,{" "}
            <a href="/legal/delivery-policy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              Delivery Policy
            </a>{" "}
            and{" "}
            <a href="/legal/refunds-returns" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              Refund &amp; Returns Policy
            </a>
            .
          </p>
        </aside>
      </div>
    </div>
  )
}
