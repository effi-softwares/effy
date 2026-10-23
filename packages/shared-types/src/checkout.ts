/**
 * Checkout and payment contracts. The server owns the Stripe secret and computes the amount; the client
 * gets only a `clientSecret` (and the publishable key) and confirms exactly one PaymentIntent. The
 * webhook is the authoritative finalizer; confirm is a fallback.
 */

import type { WireInt } from "./cart";
import type { BillingDetailsDTO } from "./payment";

import type { DeliveryFeeDTO } from "./delivery-fee";
import type { DeliveryInstructionsDTO } from "./delivery-instructions";

/** POST /v1/checkout/intent: create or locate the pending order and its PaymentIntent. */
export interface CreateCheckoutIntentRequest {
  /** The shipping address (required), snapshotted onto the order. */
  addressId: string;
  /** The billing address, when it differs; absent, null or equal to `addressId` means same as shipping. Never affects the amount. */
  billingAddressId?: string | null;
  /**
   * What the customer tells the driver for this order, or null. Normalised by the server with the
   * client's own rule (`normaliseDeliveryInstructions`); refused with a field error, never truncated.
   * The server stores what this request carries and never reads the address's saved default.
   */
  deliveryInstructions?: DeliveryInstructionsDTO | null;
  /**
   * The window chosen, one for the whole order. Required when the quote carried `effyWindows` (else
   * `slot_required`). The server holds a place when it accepts it (`slotHeldUntil`).
   */
  deliveryWindow?: { slotId: string; date: string } | null;
  /**
   * "As soon as possible", sent instead of `deliveryWindow` when the quote carried `effyWindows.asap`;
   * both or neither is `slot_required`. A day with no time is `deliveryWindow` naming its `anyTime`.
   */
  deliveryPromise?: "asap";
  /**
   * The delivery type the client is showing; required for a courier order. A mismatch with what applies
   * now (or a courier quote answered without it) is 409 `delivery_type_changed` with a fresh quote.
   */
  deliveryType?: "effy" | "courier";
  /**
   * Set by a client rendering a provider-owned payment-method list (mobile), which needs a customer
   * session; always minted for the authenticated subject. There is no `billingDetails` here: they derive
   * from the order's snapshot.
   */
  wantsProviderMethodList?: boolean;
  /**
   * Points to pay with (whole, absent = 0). Refused rather than clamped: over usable is 409
   * `points_balance_changed`, over the total 422 `points_exceed_total`, a card remainder under the
   * provider minimum 422 `points_card_remainder_too_small`; each says what is possible.
   */
  pointsToUse?: WireInt;
  /**
   * The delivery total the client is showing. A different server total is 409 `delivery_fee_changed`
   * with a fresh quote, nothing written, so the customer sees it before paying.
   */
  shownDeliveryAmount?: string | null;
  /**
   * The promotions total (goods + delivery) the client is showing. A different server total is 409
   * `promotions_changed` with the current cart, nothing written.
   */
  expectedDiscount?: string | null;
}

/** The problem `code` when the promotions total differs from the one shown. */
export const PROMOTIONS_CHANGED_CODE = "promotions_changed";

/** The problem `code` when the delivery total differs from the one shown. */
export const DELIVERY_FEE_CHANGED_CODE = "delivery_fee_changed";

export interface CreateCheckoutIntentResponse {
  orderId: string;
  orderNumber: string;
  /** Authorizes confirming exactly this PaymentIntent. Never a secret key. */
  clientSecret: string;
  publishableKey: string;
  grandTotalAmount: string;
  currency: string;
  /** What delivery promotions took off the fee; absent or "0.00" when none. */
  deliveryDiscountAmount?: string;
  /**
   * Until when the window place is held. Once passed, call intent again before confirming payment: it is
   * the last moment the server can say the place has gone.
   */
  slotHeldUntil?: string | null;
  /** The delivery type the order was written with. */
  deliveryType?: "effy" | "courier";
  /**
   * Authorizes a provider-owned payment-method list for this shopper. Mobile only (the web lists cards
   * from `GET /v1/payment-methods`); null elsewhere.
   */
  customerSessionSecret?: string | null;
  /**
   * The provider customer the session belongs to, present only beside `customerSessionSecret` (the mobile
   * SDKs take both). The secret is the credential; this id alone reaches no API. Never logged or accepted
   * as input.
   */
  customerId?: string | null;
  /** Whether the provider offers an instalment option for this intent, as the provider answers it. */
  payOverTimeAvailable?: boolean;
  /**
   * The billing details the client passes back at confirmation, derived from the order (the confirmed
   * delivery or billing address, plus the profile name), never from the request.
   */
  billingDetails?: BillingDetailsDTO | null;
  /** The points this order uses, their value, and what is left for the card. */
  pointsUsed?: WireInt;
  pointsAmount?: string;
  cardAmount?: string;
  /** True when points covered the whole order: already paid, `clientSecret` empty; go to the confirmation. */
  paidWithPoints?: boolean;
  /** The delivery charge inside `grandTotalAmount`, as lines. */
  deliveryFee?: DeliveryFeeDTO;
}

/**
 * What a customer can spend at checkout, on the quote; absent with no points. Offer up to min(usable,
 * total); the card part must be 0 or at least `cardMinimumAmount`.
 */
export interface CheckoutPointsDTO {
  usable: WireInt;
  centsPerPoint: WireInt;
  cardMinimumAmount: string;
}

/** POST /v1/checkout/confirm: the fallback finalizer for a delayed or missed webhook. */
export interface ConfirmCheckoutRequest {
  orderId: string;
}
