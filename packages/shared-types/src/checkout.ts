/**
 * Checkout & payment contracts — 019-customer-commerce-flow.
 *
 * The server (core-api) owns the Stripe secret and computes the amount from the cart; the client
 * receives ONLY a `clientSecret` (+ the publishable key, a name not a secret) and confirms exactly one
 * PaymentIntent (R3). The webhook is the authoritative finalizer; confirm is a fallback (R4).
 *
 * Data design: see specs/019-customer-commerce-flow/data-model.md §3 and contracts/core-commerce-api.md.
 *
 * 051 extends the intent response additively — every pre-existing field keeps its name and meaning.
 */

import type { BillingDetailsDTO } from "./payment";









/** POST /v1/checkout/intent — create/locate the pending order and its PaymentIntent (019, extended 021). */
export interface CreateCheckoutIntentRequest {
  /** The SHIPPING address (required). Snapshotted onto the order at placement. */
  addressId: string;
  /**
   * 023: the BILLING address, when the customer diverged from shipping. Absent / null / equal to
   * `addressId` → billing is "same as shipping" (the order stores NULL). Billing never affects the
   * amount.
   */
  billingAddressId?: string | null;
  /**
   * 047: the shopper's order-level delivery preference — "same_day" or "standard" (absent = standard).
   * Applied per package where that method is offered, standard elsewhere (FR-044). The server prices the
   * chosen method from the captured quote; the client NEVER sends a fee (SC-004).
   */
  deliveryMethod?: string | null;
}

export interface CreateCheckoutIntentResponse {
  orderId: string;
  orderNumber: string;
  /** Authorizes confirming exactly this PaymentIntent from the client. Never a secret key. */
  clientSecret: string;
  publishableKey: string;
  grandTotalAmount: string;
  currency: string;
  /**
   * 051 — authorizes a provider-owned payment-method list for THIS shopper only.
   *
   * ⚠ MOBILE ONLY, and null everywhere else. The mobile embedded element renders the saved-card list
   * itself and needs a session to do it; the web card route renders that list from
   * `GET /v1/payment-methods` and confirms with a payment-method id, so minting a session there would
   * be an unused provider round trip on a path 027 already found latency-sensitive.
   * Spike S2 — see specs/051-customer-payment-experience/research.md § R5 AMENDED.
   */
  customerSessionSecret?: string | null;
  /**
   * 051 — the billing details the CLIENT must pass back at confirmation, because the payment step no
   * longer asks the shopper for them (FR-014/FR-015).
   *
   * ⚠ DERIVED FROM THE ORDER, NEVER FROM THE REQUEST. This is the address the shopper already confirmed
   * one screen earlier — the delivery address where they did not diverge, the chosen billing address
   * where they did — plus the profile name. Sending it means the provider stops guessing a country from
   * the shopper's IP, which is where "Country: Sri Lanka" on an Australia-only storefront came from.
   *
   * ⚠ Removing the fields does NOT weaken authorization: the same data still reaches the bank, sourced
   * from Effy instead of from the shopper's keyboard (research R4).
   */
  billingDetails?: BillingDetailsDTO | null;
}

/** POST /v1/checkout/confirm — fallback finalizer (covers a delayed/missed webhook). */
export interface ConfirmCheckoutRequest {
  orderId: string;
}
