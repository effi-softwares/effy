/**
 * Checkout & payment contracts — 019-customer-commerce-flow.
 *
 * The server (core-api) owns the Stripe secret and computes the amount from the cart; the client
 * receives ONLY a `clientSecret` (+ the publishable key, a name not a secret) and confirms exactly one
 * PaymentIntent (R3). The webhook is the authoritative finalizer; confirm is a fallback (R4).
 *
 * Data design: see specs/019-customer-commerce-flow/data-model.md §3 and contracts/core-commerce-api.md.
 */

/** POST /v1/checkout/intent — create/locate the pending order and its PaymentIntent. */
export interface CreateCheckoutIntentRequest {
  addressId: string;
}

export interface CreateCheckoutIntentResponse {
  orderId: string;
  orderNumber: string;
  /** Authorizes confirming exactly this PaymentIntent from the client. Never a secret key. */
  clientSecret: string;
  publishableKey: string;
  grandTotalAmount: string;
  currency: string;
}

/** POST /v1/checkout/confirm — fallback finalizer (covers a delayed/missed webhook). */
export interface ConfirmCheckoutRequest {
  orderId: string;
}
