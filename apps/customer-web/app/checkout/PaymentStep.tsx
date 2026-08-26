"use client"

import { useElements, useStripe } from "@stripe/react-stripe-js"
import { CardNumberElement } from "@stripe/react-stripe-js"
import Link from "next/link"
import { ArrowLeft, Lock } from "lucide-react"
import { useEffect, useState } from "react"

import type { CreateCheckoutIntentResponse, PaymentMethodDTO } from "@effy/shared-types"

import { ActionButton } from "@/components/storefront/actions"
import { formatMoney } from "@/lib/money"
import { capture } from "@/lib/telemetry"

import { CardFields, useCardFieldState } from "./_payment/CardFields"
import { BANK_APPROVAL_REQUIRED, failureFor, type PaymentFailure } from "./_payment/failures"
import { MethodList, type MethodKind } from "./_payment/MethodList"
import { PaymentNotice } from "./_payment/PaymentNotice"
import { NEW_CARD, SaveCardConsent, SavedCards } from "./_payment/SavedCards"
import { WalletDivider, WalletRow } from "./_payment/WalletRow"
import {
  confirmCardPayment,
  confirmPayOverTime,
  confirmSavedCard,
  confirmWalletPayment,
} from "./_payment/confirm"

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
  const stripe = useStripe()
  const elements = useElements()
  const card = useCardFieldState()

  const [saveCard, setSaveCard] = useState(true)
  const [busy, setBusy] = useState(false)
  // ⚠ A structured failure, not a string. The words the shopper reads are chosen from the provider's
  // decline code where there is one, so the message can name a cause rather than echo a sentence
  // written for a developer (FR-036).
  const [failure, setFailure] = useState<PaymentFailure | null>(null)
  // Set while the bank has the shopper. NOT a failure, and must not read like one (FR-040).
  const [awaitingBank, setAwaitingBank] = useState(false)
  // Whether a wallet actually rendered. Only then is the "or pay another way" rule meaningful — a rule
  // with nothing above it is a divider dividing one thing.
  const [walletShown, setWalletShown] = useState(false)

  // 051 US3 — the shopper's kept cards. Read once when the step opens.
  //
  // ⚠ An empty list means "no kept cards"; a FAILED read means "we could not ask", and the two must not
  // look the same. On failure the list stays empty and the card form is shown — the shopper can still
  // pay, which is the outcome that matters — but nothing claims they have no cards (FR-036).
  const [cards, setCards] = useState<PaymentMethodDTO[]>([])
  const [selectedCard, setSelectedCard] = useState<string>(NEW_CARD)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch("/api/payment-methods", { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as { paymentMethods?: PaymentMethodDTO[] }
        if (cancelled || !data.paymentMethods?.length) return
        setCards(data.paymentMethods)
        // ⚠ Pre-select the default, but only if it can actually be used — pre-selecting an expired
        // card would put the shopper one tap from a refusal (FR-022/FR-023).
        const preferred =
          data.paymentMethods.find((c) => c.isDefault && c.usable) ??
          data.paymentMethods.find((c) => c.usable)
        setSelectedCard(preferred?.id ?? NEW_CARD)
      } catch {
        // Silent: the card form is already the fallback, and an error about a list the shopper never
        // asked for is noise at the worst moment.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // 051 US4 — which family of payment the shopper is using. Card and pay-over-time are mutually
  // exclusive, and only one element is ever mounted (see MethodList).
  const [method, setMethod] = useState<MethodKind>("card")
  // ⚠ Straight from the server's read of the intent — never inferred here. See the DTO's note.
  const laterAvailable = intent.payOverTimeAvailable === true
  const usingNewCard = selectedCard === NEW_CARD && method === "card"

  /**
   * ⚠ FR-042 — an order that has ALREADY been paid for must not be payable again.
   *
   * A shopper reaches this screen with a stale intent more easily than it sounds: the browser back
   * button from the receipt, a tab left open, a re-opened notification. The server refuses a second
   * charge (FR-038), but showing the form at all invites the attempt and the confusion that follows.
   *
   * ⚠ ASKED, NOT ASSUMED. The confirm endpoint is the idempotent fallback finaliser: calling it for a
   * pending order reports `paid: false` and changes nothing, and for a paid one reports `paid: true`
   * without applying anything twice. That makes it the honest way to ask "is this already done?" —
   * far better than trusting a flag the client happens to be holding.
   *
   * ⚠⚠ IT SAYS SO. IT DOES NOT NAVIGATE. This used to `router.replace` straight to the receipt, and
   * that silent teleport was a live bug in dev on 2026-08-26: a shopper who pressed "Continue to
   * payment" for a SECOND order had the payment screen flash up and replace itself with the receipt
   * for their FIRST one. Proven from the two sides — the redirect went to `?order=<first order>` at
   * 05:19:55, while the second order was not created until 05:22:14, so the screen was rendering an
   * intent that belonged to a finished attempt.
   *
   * The redirect was never the requirement; not being able to pay twice was. So this states the fact
   * and hands over the two ways out. A shopper is never moved somewhere they did not ask to go, and
   * can never be shown one order's receipt while believing they are buying another.
   */
  const [alreadyPaidOrder, setAlreadyPaidOrder] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch("/api/checkout/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: intent.orderId }),
          cache: "no-store",
        })
        if (!res.ok) return
        const data = (await res.json()) as { paid?: boolean }
        if (!cancelled && data.paid) {
          setAlreadyPaidOrder(intent.orderId)
        }
      } catch {
        // Best-effort. A failed check must never block a shopper who genuinely needs to pay.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [intent.orderId])

  async function removeCard(id: string) {
    const res = await fetch(`/api/payment-methods/${id}`, { method: "DELETE" })
    // 404 is success from the shopper's point of view: the card is gone either way.
    if (!res.ok && res.status !== 404) {
      setFailure({
        title: "We couldn't remove that card.",
        detail: "Your cards are unchanged. Try again in a moment.",
        retryable: true,
      })
      return
    }
    capture({ name: "card_removed", props: { from: "checkout" } })
    setCards((prev) => {
      const next = prev.filter((c) => c.id !== id)
      // ⚠ FR-024b — removing the selected card must leave a usable selection behind, not a dead one.
      if (id === selectedCard) {
        setSelectedCard(next.find((c) => c.usable)?.id ?? NEW_CARD)
      }
      return next
    })
  }

  const amount = formatMoney(intent.grandTotalAmount, intent.currency)
  // A kept card and a pay-over-time option are both ready as soon as they are selected: there is
  // nothing for Effy to validate, because the provider's own form does it.
  const ready = Boolean(stripe && elements) && (usingNewCard ? card.complete : true)

  async function pay() {
    if (!stripe || !elements || busy) return
    // Only the new-card route needs the element; a kept card confirms by id.
    const cardNumberElement = elements.getElement(CardNumberElement)
    if (usingNewCard && !cardNumberElement) return

    setBusy(true)
    setFailure(null)
    setAwaitingBank(false)
    try {
      // Three routes, one for each family. Pay-over-time redirects to the provider; a kept card needs
      // nothing typed and confirms by id; a new card confirms from the element.
      const outcome = method === "later"
        ? await confirmPayOverTime({
            stripe,
            elements: elements!,
            clientSecret: intent.clientSecret,
            billingDetails: intent.billingDetails ?? null,
            returnUrl: `${window.location.origin}/checkout/complete?order=${intent.orderId}`,
          })
        : usingNewCard
        ? await confirmCardPayment({
            stripe,
            clientSecret: intent.clientSecret,
            // Non-null by the guard above: the new-card route returns early without an element.
            cardNumberElement: cardNumberElement!,
            billingDetails: intent.billingDetails ?? null,
            saveCard,
          })
        : await confirmSavedCard({
            stripe,
            clientSecret: intent.clientSecret,
            paymentMethodId: selectedCard,
          })

      // ⚠ The FAMILY only — never which provider, never an amount, never a card reference.
      const family =
        method === "later" ? "pay_over_time" : usingNewCard ? "card" : "saved_card"

      switch (outcome.kind) {
        case "succeeded":
        case "processing":
          // ⚠ `processing` goes to the receipt too, and that is correct: the receipt reads the
          // webhook-authoritative order state and can say "we're confirming your payment". What it must
          // NOT do is announce success here (FR-040).
          capture({ name: "payment_succeeded", props: { method: family } })
          if (family === "card" && saveCard) capture({ name: "card_saved" })
          if (family === "saved_card") capture({ name: "saved_card_used" })
          // ⚠ A FULL PAGE LOAD, NOT `router.push`. Checkout is finished, and every scrap of client
          // state that belongs to it must die with it. A soft navigation leaves this flow's React
          // state in the client router's cache, where a later checkout can render a FINISHED
          // attempt's intent — which is precisely the defect the already-paid notice above records.
          // The cost is one page load at the terminal step of the flow, which is not a cost.
          window.location.assign(`/checkout/complete?order=${intent.orderId}`)
          return
        case "requires_action":
          capture({ name: "payment_failed", props: { method: family, reason: "needs_action" } })
          // ⚠ The provider drives the bank's challenge and returns to `return_url`. Saying so is the
          // point: this is the moment a shopper most often panics and closes the tab, and being told
          // in advance that their bank will ask — and that they will be brought back — is what stops
          // that (FR-040).
          setAwaitingBank(true)
          return
        case "failed":
          setFailure(failureFor({ declineCode: outcome.declineCode, providerMessage: outcome.message }))
          return
      }
    } finally {
      // ⚠ ALWAYS. The previous implementation cleared `busy` only on a validation error, so the control
      // stayed disabled and reading "Processing…" through the navigation and the receipt's two server
      // round trips — and forever if that navigation failed (research R12 D2, FR-041).
      setBusy(false)
    }
  }

  // ⚠ AN ALREADY-PAID ORDER TAKES OVER THE WHOLE SCREEN, rather than sitting as a notice beside a pay
  // button that cannot work. A form the shopper is invited to fill in and then refused is worse than no
  // form; and the two things they might actually want — see what they paid for, or buy this basket —
  // are the only two controls here.
  if (alreadyPaidOrder) {
    return (
      <div className="container pt-10">
        <div className="mx-auto max-w-lg py-16 text-center">
          <h1 className="text-lg font-medium">This order has already been paid</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            Nothing further has been charged. You can view its receipt, or go back to checkout to
            place a new order.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link
              href={`/checkout/complete?order=${alreadyPaidOrder}`}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
            >
              View receipt
            </Link>
            <button
              type="button"
              onClick={onBack}
              className="rounded-full border px-5 py-2.5 text-sm font-medium"
            >
              Back to checkout
            </button>
          </div>
        </div>
      </div>
    )
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
          {/* ⚠ ABOVE the card form, and that ordering is the requirement (FR-008). A wallet is one tap
              against sixteen typed digits; putting it below the form it replaces would bury it. */}
          <WalletRow
            disabled={busy}
            onRendered={setWalletShown}
            onError={(message) => setFailure(failureFor({ providerMessage: message }))}
            onConfirm={async () => {
              setBusy(true)
              setFailure(null)
    setAwaitingBank(false)
              try {
                const outcome = await confirmWalletPayment({
                  stripe: stripe!,
                  elements: elements!,
                  clientSecret: intent.clientSecret,
                  billingDetails: intent.billingDetails ?? null,
                  returnUrl: `${window.location.origin}/checkout/complete?order=${intent.orderId}`,
                })
                if (outcome.kind === "failed") {
                  setFailure(failureFor({ declineCode: outcome.declineCode, providerMessage: outcome.message }))
                  return
                }
                if (outcome.kind === "succeeded" || outcome.kind === "processing") {
                  capture({ name: "payment_succeeded", props: { method: "wallet" } })
                  // A full load, for the same reason as the card route above.
                  window.location.assign(`/checkout/complete?order=${intent.orderId}`)
                }
              } finally {
                setBusy(false)
              }
            }}
          />

          {walletShown ? <WalletDivider /> : null}

          <MethodList
            selected={method}
            onSelect={(next) => {
              setMethod(next)
              capture({
                name: "payment_method_selected",
                props: { method: next === "later" ? "pay_over_time" : "card" },
              })
            }}
            laterAvailable={laterAvailable}
            busy={busy}
          >
            <div className="flex flex-col gap-5 px-4.5 pb-5 pt-1">
              <div className="h-px bg-border" />
              <SavedCards
                cards={cards}
                selectedId={selectedCard}
                onSelect={setSelectedCard}
                onRemove={removeCard}
                busy={busy}
              />
              {usingNewCard ? (
                <section aria-labelledby="pay-by-card" className="flex flex-col gap-5">
                  <h2 id="pay-by-card" className="sr-only">
                    Pay by card
                  </h2>
                  <CardFields state={card} />
                  <SaveCardConsent checked={saveCard} onChange={setSaveCard} disabled={busy} />
                </section>
              ) : null}
            </div>
          </MethodList>
        </div>

        {/* The pay rail. A border-left and space hold it — not a card (Principle V). */}
        <aside className="flex flex-col gap-6 lg:sticky lg:top-22 lg:border-l lg:pl-12">
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

          {failure ? <PaymentNotice failure={failure} /> : null}
          {awaitingBank && !failure ? (
            <PaymentNotice failure={BANK_APPROVAL_REQUIRED} kind="waiting" />
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
