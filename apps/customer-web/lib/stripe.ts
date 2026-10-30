import { loadStripe, type Stripe, type StripeElementsOptions } from "@stripe/stripe-js"

import { storefrontPaymentAppearance } from "@effy/design-system/stripe-storefront-appearance"

import { stripeConfig } from "@/lib/config"

/**
 * The Stripe.js singleton. `loadStripe` is called once per page load with the publishable key
 * (browser-safe - R3). Client-only: this lives outside the `(auth)` Amplify quarantine, under the
 * commerce tree, and only the checkout island imports it. The secret key never touches the client.
 */
let stripePromise: Promise<Stripe | null> | null = null

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = loadStripe(stripeConfig().publishableKey)
  }
  return stripePromise
}

/**
 * The Elements options for the payment step. The appearance is generated from `tokens.css`
 * (guarded by `tokens:check`), never typed out here. Light only: the storefront has no dark appearance.
 * Elements reads `appearance` once, when the group is created.
 */
export function paymentElementsOptions(clientSecret: string): StripeElementsOptions {
  return {
    clientSecret,
    appearance: storefrontPaymentAppearance,
  }
}
