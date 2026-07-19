"use client"

import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js"
import { useState } from "react"

/**
 * The Stripe Payment Element (US3). The server already created the PaymentIntent and passed its
 * client_secret via <Elements>; here we only confirm. `redirect: "if_required"` keeps card payments
 * inline and handles a 3DS challenge via redirect to the return_url. On inline success we hand off to
 * the receipt — but the WEBHOOK is authoritative for the order state (R4), which the receipt reads.
 */
export function PaymentForm({ orderId, onSuccess }: { orderId: string; onSuccess: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function pay(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setBusy(true)
    setError(null)

    const { error: submitError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/checkout/complete?order=${orderId}`,
      },
      redirect: "if_required",
    })

    if (submitError) {
      // A declined card / validation error — no order is placed; the cart is preserved (SC-007).
      setError(submitError.message ?? "Your payment could not be processed.")
      setBusy(false)
      return
    }
    // Inline success (no redirect needed). The receipt reads the webhook-authoritative order state.
    onSuccess()
  }

  return (
    <form onSubmit={pay} className="space-y-4">
      <PaymentElement />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={!stripe || busy}
        className="flex h-12 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Processing…" : "Pay now"}
      </button>
    </form>
  )
}
