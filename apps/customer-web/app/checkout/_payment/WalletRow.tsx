"use client"

import { ExpressCheckoutElement } from "@stripe/react-stripe-js"
import { useState } from "react"

import { cn } from "@/lib/utils"

/**
 * One-tap wallets (Apple Pay, Google Pay, Link): the one place the provider draws the UI, since Apple and
 * Google require their own button art. It shares the elements group with the card fields, so each wallet
 * appears once (a second `<Elements>` would duplicate them and confirm against a second intent). Wallets
 * need a registered payment method domain on the Stripe account.
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
  // Three states, not two. "Not asked yet" and "asked, nothing available" must be distinguishable,
  // because they render differently: nothing at all vs. nothing at all - but only the second is
  // allowed to let the card form move up. Rendering a heading before the element reports would leave
  // an orphaned "Pay quickly with" above empty space on a device with no wallet.
  const [available, setAvailable] = useState<"unknown" | "yes" | "no">("unknown")

  if (available === "no") return null

  return (
    // While a card payment is in flight the wallet must not start a second one.
    <div
      aria-disabled={disabled || undefined}
      className={cn(available === "unknown" && "min-h-0", disabled && "pointer-events-none opacity-50")}
    >
      <ExpressCheckoutElement
        options={{
          // Effy's buttons are pills everywhere on the platform; the wallet row matches the pay
          // control it sits above.
          buttonHeight: 48,
          buttonTheme: { applePay: "black", googlePay: "black" },
          layout: { maxColumns: 3, maxRows: 1 },
        }}
        onReady={({ availablePaymentMethods }) => {
          // `availablePaymentMethods` is undefined when nothing is available. A shopper on a browser
          // with no wallet must see no heading, no gap and no apology - just the card form
          // (US2 scenario 2).
          const shown = Boolean(availablePaymentMethods)
          setAvailable(shown ? "yes" : "no")
          onRendered(shown)
        }}
        onConfirm={async () => {
          try {
            await onConfirm()
          } catch {
            onError("We couldn't complete that payment. Nothing has been charged - try again, or pay by card.")
          }
        }}
        onCancel={() => {
          // Deliberately silent. Dismissing a wallet sheet is a choice, not a failure: nothing was
          // charged and the basket is intact, so an error message here would alarm a shopper who did
          // exactly what they meant to (US2 scenario 4).
        }}
        onLoadError={() => {
          // The element failing to load is not worth a message. Card payment is unaffected, and an
          // error about a payment method the shopper never chose is noise at the worst moment.
          setAvailable("no")
          onRendered(false)
        }}
      />

      {available === "yes" ? (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          One tap - no card details to type.
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
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}
