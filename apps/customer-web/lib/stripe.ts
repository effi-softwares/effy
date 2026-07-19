import { loadStripe, type Stripe } from "@stripe/stripe-js"

import { stripeConfig } from "@/lib/config"

/**
 * The Stripe.js singleton (US3). `loadStripe` is called ONCE per page load with the PUBLISHABLE key
 * (browser-safe — R3). Client-only: this lives outside the `(auth)` Amplify quarantine, under the
 * commerce tree, and only the checkout island imports it (R11). The secret key never touches the client.
 */
let stripePromise: Promise<Stripe | null> | null = null

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = loadStripe(stripeConfig().publishableKey)
  }
  return stripePromise
}
