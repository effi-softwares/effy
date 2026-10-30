import type { Stripe, StripeCardNumberElement, StripeElements } from "@stripe/stripe-js"

import type { BillingDetailsDTO } from "@effy/shared-types"

/**
 * Confirms a card payment. The card form asks for no country, postcode or name, so the billing details
 * come from the intent response (the address the shopper confirmed) and are passed with the split
 * elements (`payment_method: { card, billing_details }`).
 */

export type ConfirmOutcome =
  | { kind: "succeeded" }
  /** The provider took the payment but has not settled it yet - not a success and not a failure. */
  | { kind: "processing" }
  /** The shopper's bank wants them to approve it; the provider handles the redirect. */
  | { kind: "requires_action" }
  | {
    kind: "failed"
    message: string
    /** The provider's `decline_code`, where given, so the caller can choose the words. */
    declineCode?: string
  }

/**
 * Every message below is ours. A provider's raw decline string is written for a developer reading a
 * dashboard, not for a shopper deciding whether to try another card. The provider's own message
 * is preferred where it exists, because it is localised and specific ("your card was declined"), and the
 * fallback is a sentence a shopper can act on - never "something went wrong".
 */
const GENERIC_FAILURE =
  "We couldn't take that payment. Nothing has been charged - try again, or use a different payment method."

export async function confirmCardPayment(input: {
  stripe: Stripe
  clientSecret: string
  /** The split card-number element. The other two are read from the same Elements group by the SDK. */
  cardNumberElement: StripeCardNumberElement
  billingDetails: BillingDetailsDTO | null
  /**
   * Whether the shopper ticked "save this card".
   *
   * This is the only thing that decides whether a card is kept. The server deliberately does
   * not set `setup_future_usage` on the intent - doing so would keep a card the shopper declined, and it
   * is a documented integration error besides. `allow_redisplay` is set explicitly
   * alongside, because without a customer session the provider does not infer it from a checkbox it
   * never rendered.
   */
  saveCard: boolean
}): Promise<ConfirmOutcome> {
  const { stripe, clientSecret, cardNumberElement, billingDetails, saveCard } = input

  const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
    payment_method: {
      card: cardNumberElement,
      ...(billingDetails
        ? {
          billing_details: {
            name: billingDetails.name ?? undefined,
            email: billingDetails.email ?? undefined,
            address: {
              line1: billingDetails.address.line1,
              line2: billingDetails.address.line2 ?? undefined,
              city: billingDetails.address.city,
              state: billingDetails.address.state,
              postal_code: billingDetails.address.postalCode,
              country: billingDetails.address.country,
            },
          },
        }
        : {}),
      ...(saveCard ? { allow_redisplay: "always" as const } : {}),
    },
    ...(saveCard ? { setup_future_usage: "off_session" as const } : {}),
  })

  if (error) {
    return {
      kind: "failed",
      message: error.message ?? GENERIC_FAILURE,
      declineCode: error.decline_code,
    }
  }
  return outcomeFor(paymentIntent?.status)
}

/** Confirm with a card the shopper has already kept - nothing is typed, so nothing is collected. */
export async function confirmSavedCard(input: {
  stripe: Stripe
  clientSecret: string
  paymentMethodId: string
}): Promise<ConfirmOutcome> {
  const { error, paymentIntent } = await input.stripe.confirmCardPayment(input.clientSecret, {
    payment_method: input.paymentMethodId,
  })
  if (error) {
    return {
      kind: "failed",
      message: error.message ?? GENERIC_FAILURE,
      declineCode: error.decline_code,
    }
  }
  return outcomeFor(paymentIntent?.status)
}

/** Maps the intent status to what the shopper is told: `processing` is not paid, and an unknown status reads as still confirming, never failed. */
function outcomeFor(status: string | undefined): ConfirmOutcome {
  switch (status) {
    case "succeeded":
      return { kind: "succeeded" }
    case "processing":
      return { kind: "processing" }
    case "requires_action":
    case "requires_confirmation":
      return { kind: "requires_action" }
    case "requires_payment_method":
      return { kind: "failed", message: GENERIC_FAILURE }
    default:
      // Never a failure. The receipt reads the webhook-authoritative order state and will resolve it.
      return { kind: "processing" }
  }
}

/**
 * Confirm a payment the shopper authorised in a wallet sheet.
 *
 * A different call from the card route, and it has to be. The wallet's own sheet has already
 * collected the payment method, so there is no element to hand over - `confirmPayment` reads what the
 * Express Checkout Element captured from the shared Elements group. Passing a card element here would
 * confirm the wrong thing.
 *
 * `redirect: "if_required"` keeps the common case inline. A wallet payment that needs the bank's
 * approval redirects to `returnUrl`, which is why one must be supplied even though most never use it
 * omitting it makes 3DS fail with no way back.
 */
export async function confirmWalletPayment(input: {
  stripe: Stripe
  elements: StripeElements
  clientSecret: string
  billingDetails: BillingDetailsDTO | null
  returnUrl: string
}): Promise<ConfirmOutcome> {
  const { error, paymentIntent } = await input.stripe.confirmPayment({
    elements: input.elements,
    clientSecret: input.clientSecret,
    confirmParams: {
      return_url: input.returnUrl,
      ...(input.billingDetails
        ? {
          payment_method_data: {
            billing_details: {
              name: input.billingDetails.name ?? undefined,
              email: input.billingDetails.email ?? undefined,
              address: {
                line1: input.billingDetails.address.line1,
                line2: input.billingDetails.address.line2 ?? undefined,
                city: input.billingDetails.address.city,
                state: input.billingDetails.address.state,
                postal_code: input.billingDetails.address.postalCode,
                country: input.billingDetails.address.country,
              },
            },
          },
        }
        : {}),
    },
    redirect: "if_required",
  })

  if (error) {
    return {
      kind: "failed",
      message: error.message ?? GENERIC_FAILURE,
      declineCode: error.decline_code,
    }
  }
  return outcomeFor(paymentIntent?.status)
}

/**
 * Confirm a pay-over-time payment - Klarna, Zip, Afterpay.
 *
 * Always a redirect. Every bnpl provider takes the shopper to its own site to assess and approve
 * them, so `return_url` is not optional here the way it is for a card: without it the shopper leaves
 * Effy and has no route back. `redirect: "if_required"` still applies - it means "redirect only when
 * the method needs it", and these always do.
 *
 * NO `setup_future_usage`. Afterpay and Zip do not support it at all, and Klarna's support excludes
 * the saved-card flow. Sending it turns a working payment into an API error, so the save-card consent
 * deliberately does not reach this path.
 */
export async function confirmPayOverTime(input: {
  stripe: Stripe
  elements: StripeElements
  clientSecret: string
  billingDetails: BillingDetailsDTO | null
  returnUrl: string
}): Promise<ConfirmOutcome> {
  const { error, paymentIntent } = await input.stripe.confirmPayment({
    elements: input.elements,
    clientSecret: input.clientSecret,
    confirmParams: {
      return_url: input.returnUrl,
      ...(input.billingDetails
        ? {
          payment_method_data: {
            billing_details: {
              name: input.billingDetails.name ?? undefined,
              email: input.billingDetails.email ?? undefined,
              address: {
                line1: input.billingDetails.address.line1,
                line2: input.billingDetails.address.line2 ?? undefined,
                city: input.billingDetails.address.city,
                state: input.billingDetails.address.state,
                postal_code: input.billingDetails.address.postalCode,
                country: input.billingDetails.address.country,
              },
            },
          },
        }
        : {}),
    },
    redirect: "if_required",
  })

  if (error) {
    return {
      kind: "failed",
      message: error.message ?? GENERIC_FAILURE,
      declineCode: error.decline_code,
    }
  }
  return outcomeFor(paymentIntent?.status)
}
