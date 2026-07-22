/**
 * Checkout & payment contracts — 019-customer-commerce-flow.
 *
 * The server (core-api) owns the Stripe secret and computes the amount from the cart; the client
 * receives ONLY a `clientSecret` (+ the publishable key, a name not a secret) and confirms exactly one
 * PaymentIntent (R3). The webhook is the authoritative finalizer; confirm is a fallback (R4).
 *
 * Data design: see specs/019-customer-commerce-flow/data-model.md §3 and contracts/core-commerce-api.md.
 */

/**
 * The three delivery service levels (021). Availability per package follows from the shop's origin zone
 * and the customer's destination zone — never from shop identity, which the customer never sees.
 */
export type CheckoutDeliveryMethod = "same_day" | "scheduled" | "standard";

/** One selectable delivery option for a package (021). Server-computed; the client never sends a fee. */
export interface DeliveryMethodOptionDTO {
  method: CheckoutDeliveryMethod;
  /** Customer-facing label, e.g. "Same-day". */
  serviceLevel: string;
  feeAmount: string;
  /** Derived window, e.g. "Today by 6pm" / "in 2–3 days"; null for a scheduled method (pick a date). */
  window: string | null;
  /** Selectable dates for method='scheduled'; null otherwise. */
  scheduleDates: string[] | null;
}

/**
 * One ANONYMOUS package in a quote (021) — the items from a single shop, shown without any shop
 * identity or location (FR-019). `packageKey` is an opaque grouping token.
 */
export interface QuotePackageItemDTO {
  productId: string;
  name: string;
  quantity: number;
  imageUrl: string | null;
}

export interface QuotePackageDTO {
  packageKey: string;
  items: QuotePackageItemDTO[];
  /** False when this package cannot be delivered to the address (021 US2). methods is then empty. */
  serviceable: boolean;
  methods: DeliveryMethodOptionDTO[];
}

/** POST /v1/checkout/quote — per-package delivery options for the cart + address (021 US1). */
export interface DeliveryQuoteRequest {
  addressId: string;
}

export interface DeliveryQuoteResponse {
  packages: QuotePackageDTO[];
  quoteId: string;
  /** The captured quote is honored until this instant; after it the customer must re-quote (021 R7). */
  expiresAt: string;
}

/** The customer's chosen method for one package (021). Carries NO fee — the server prices it (SC-004). */
export interface DeliverySelectionDTO {
  packageKey: string;
  method: CheckoutDeliveryMethod;
  /** Required only when method='scheduled'. */
  scheduledDate?: string | null;
}

/** One line of the per-package delivery breakdown on the intent response (021). Anonymous. */
export interface DeliveryBreakdownLineDTO {
  packageKey: string;
  serviceLevel: string;
  feeAmount: string;
  window: string | null;
}

/** POST /v1/checkout/intent — create/locate the pending order and its PaymentIntent (019, extended 021). */
export interface CreateCheckoutIntentRequest {
  /** The SHIPPING address (required). Serviceability + delivery pricing key off this (021). */
  addressId: string;
  /**
   * 023: the BILLING address, when the customer diverged from shipping. Absent / null / equal to
   * `addressId` → billing is "same as shipping" (the order stores NULL). Billing never affects the
   * amount or the quote.
   */
  billingAddressId?: string | null;
  /** 021: the captured quote being placed. Honored while unexpired; else 409 → re-quote. */
  quoteId?: string;
  /** 021: the customer's per-package method choices (default preference + overrides, resolved). */
  selections?: DeliverySelectionDTO[];
  /**
   * 021: packages the customer confirmed proceeding WITHOUT (auto-set-aside undeliverable items). MUST
   * exactly match the server's unserviceable set or the intent is refused (FR-006b, SC-011a).
   */
  excludedPackageKeys?: string[];
}

export interface CreateCheckoutIntentResponse {
  orderId: string;
  orderNumber: string;
  /** Authorizes confirming exactly this PaymentIntent from the client. Never a secret key. */
  clientSecret: string;
  publishableKey: string;
  grandTotalAmount: string;
  currency: string;
  /** 021: the per-package delivery breakdown, for the order summary. Anonymous. */
  deliveryBreakdown?: DeliveryBreakdownLineDTO[];
}

/** POST /v1/checkout/confirm — fallback finalizer (covers a delayed/missed webhook). */
export interface ConfirmCheckoutRequest {
  orderId: string;
}
