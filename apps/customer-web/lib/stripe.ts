import { loadStripe, type Stripe, type StripeElementsOptions } from "@stripe/stripe-js"

import { paymentAppearanceLight } from "@effy/design-system/stripe-appearance"

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

/**
 * The Elements options for the payment step (051 T039).
 *
 * ⚠ The appearance is GENERATED from `packages/design-system/src/tokens.css`, never typed out here.
 * Transcribing the palette into a provider config by hand would create a second copy of the brand that
 * nothing checks — so the day someone edits tokens.css, the card fields keep the old colours and no test
 * notices. `tokens:check` guards the generated file (Principle II).
 *
 * ⚠ LIGHT ONLY, and that is a property of this surface rather than an oversight. `apps/customer-web` is
 * light-only by operator decision: its root layout never applies the design system's `.dark` class and
 * `globals.css` pins `color-scheme: light`, so there is no appearance choice to follow. The dark half is
 * generated and shipped, so the day the storefront gains a switcher this becomes a one-line change
 * (research R16).
 *
 * ⚠ The provider reads `appearance` when the Elements group is CREATED and does not re-theme in place.
 * If an appearance switcher ever lands here, the group must be re-created rather than updated.
 */
export function paymentElementsOptions(clientSecret: string): StripeElementsOptions {
  return {
    clientSecret,
    appearance: paymentAppearanceLight,
  }
}
