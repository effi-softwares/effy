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
  /**
   * 051 — set by a client that renders a PROVIDER-OWNED payment-method list (the mobile in-app element)
   * and therefore needs a customer session. Web renders Effy's own list and leaves this unset.
   *
   * ⚠ Asking is not authorization to get someone else's: the session is always minted for the
   * AUTHENTICATED subject, so the worst a hostile client achieves is a session for itself.
   *
   * ⚠ There is deliberately NO `billingDetails` on this request. Billing details are DERIVED from the
   * order's own snapshot; accepting them here would let a client contradict the address it confirmed
   * one screen earlier (contract § 1, FR-016).
   */
  wantsProviderMethodList?: boolean;
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
   * 051 — the provider customer the session belongs to. Present ONLY beside `customerSessionSecret`,
   * i.e. only for a client that renders a provider-owned method list (mobile).
   *
   * ⚠ REQUIRED BY THE MOBILE SDKs, which take the id and the secret together
   * (`createWithCustomerSession(id, clientSecret)`); a session without its id cannot be attached. The
   * SECRET is the credential — this id alone reaches no API, because every call that reads a customer
   * needs a secret key that never leaves core-api. Absent from the web response, never logged, never in
   * telemetry, and never accepted as request input (data-model § 1, amended).
   */
  customerId?: string | null;
  /**
   * 051 US4 — whether the provider offers any instalment option for THIS intent.
   *
   * ⚠ ANSWERED BY THE PROVIDER, NOT GUESSED. Availability depends on the basket total and on account
   * eligibility, neither of which a client knows. A guess produces exactly what FR-010/FR-011 forbid:
   * an option offered and then refused after the shopper commits, or one that vanishes unexplained.
   *
   * ⚠ A boolean, not the list — which providers appear is the payment element's business, and sending
   * the raw list would leak account configuration to a client with no use for it.
   */
  payOverTimeAvailable?: boolean;
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
