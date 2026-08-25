"use client"

import { ExpressCheckoutElement } from "@stripe/react-stripe-js"
import { useState } from "react"

/**
 * One-tap wallets (051 US2) — Apple Pay, Google Pay and Link.
 *
 * ⚠ THIS IS THE ONE PLACE EFFY DOES NOT DRAW THE UI, and the reason is brand rules rather than
 * security. Apple and Google both require their own button art, sized and worded to their
 * specifications; a hand-built "Pay with Apple Pay" button breaches their guidelines and gets an app
 * or a site rejected. So FR-029 governs here instead of FR-028: style within what the Appearance API
 * allows, and no further.
 *
 * ⚠ IT SHARES THE ELEMENTS GROUP with the card fields, which is what stops a wallet being listed
 * twice. Stripe's own guidance: when an Express Checkout Element and a Payment Element sit on one
 * page, wallets appear ONLY in the express element. Mounting this in a second `<Elements>` would
 * duplicate every wallet and confirm against a second intent (research R6).
 *
 * ⚠ WHY THIS NEVER RENDERED BEFORE. Apple Pay and Link were switched on in the Stripe account the
 * whole time; they could not appear because no payment method domain was registered
 * (`GET /v1/payment_method_domains` returned `[]`). Registered 2026-08-25 as
 * `pmd_1U8Fa4LCcnBe97EEswqHo4x7` — research R2.
 */
export function WalletRow({
  onConfirm,
  onError,
  onRendered,
  disabled,
}: {
  /** Confirm the payment the shopper authorised in the wallet sheet. */
  onConfirm: () => Promise<void>
  onError: (message: string) => void
  /** Told whether a wallet actually rendered, so the page can decide whether a divider makes sense. */
  onRendered: (shown: boolean) => void
  disabled?: boolean
}) {
  // ⚠ Three states, not two. "Not asked yet" and "asked, nothing available" must be distinguishable,
  // because they render differently: nothing at all vs. nothing at all — but only the second is
  // allowed to let the card form move up. Rendering a heading before the element reports would leave
  // an orphaned "Pay quickly with" above empty space on a device with no wallet.
  const [available, setAvailable] = useState<"unknown" | "yes" | "no">("unknown")

  if (available === "no") return null

  return (
    <div className={available === "unknown" ? "min-h-0" : undefined}>
      <ExpressCheckoutElement
        options={{
          // Effy's buttons are pills everywhere on the platform; the wallet row matches the pay
          // control it sits above.
          buttonHeight: 48,
          buttonTheme: { applePay: "black", googlePay: "black" },
          layout: { maxColumns: 3, maxRows: 1 },
        }}
        onReady={({ availablePaymentMethods }) => {
          // ⚠ `availablePaymentMethods` is undefined when NOTHING is available. A shopper on a browser
          // with no wallet must see no heading, no gap and no apology — just the card form
          // (US2 scenario 2).
          const shown = Boolean(availablePaymentMethods)
          setAvailable(shown ? "yes" : "no")
          onRendered(shown)
        }}
        onConfirm={async () => {
          try {
            await onConfirm()
          } catch {
            onError("We couldn't complete that payment. Nothing has been charged — try again, or pay by card.")
          }
        }}
        onCancel={() => {
          // ⚠ Deliberately silent. Dismissing a wallet sheet is a choice, not a failure: nothing was
          // charged and the basket is intact, so an error message here would alarm a shopper who did
          // exactly what they meant to (US2 scenario 4).
        }}
        onLoadError={() => {
          // ⚠ The element failing to load is NOT worth a message. Card payment is unaffected, and an
          // error about a payment method the shopper never chose is noise at the worst moment.
          setAvailable("no")
          onRendered(false)
        }}
      />

      {available === "yes" ? (
        <p className="mt-2.5 text-center text-xs text-muted-foreground">
          One tap — no card details to type.
        </p>
      ) : null}
    </div>
  )
}

/** The "or pay another way" rule, shown only when a wallet is actually above it. */
export function WalletDivider({ label = "Or pay another way" }: { label?: string }) {
  return (
    <div className="flex items-center gap-4">
      <span className="h-px flex-1 bg-border" />
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}
