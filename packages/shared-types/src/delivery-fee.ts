/**
 * Delivery fee — the customer-facing words and shapes (077-delivery-fee-engine-v2).
 *
 * Contract: `specs/077-delivery-fee-engine-v2/contracts/routes.md`.
 *
 * Its own file because both the quote (`delivery.ts`) and the intent (`checkout.ts`) carry a fee, and
 * those two already depend on each other one way. ⚠ Money is a 2-dp decimal string, as everywhere.
 */

/**
 * 077 — one line of what a customer is charged for delivery.
 *   delivery          the fee for the distance and weight, before any window surcharge
 *   window_surcharge  what the chosen window adds
 *   small_order       the extra fee on a basket under the business's small-order amount
 *   free_delivery     the saving when the basket reaches the free-delivery amount (NEGATIVE)
 */
export type DeliveryFeeLineKind = "delivery" | "window_surcharge" | "small_order" | "free_delivery";

/**
 * ⚠ THE ONLY PLACE THESE WORDS ARE WRITTEN (077 FR-028/FR-033). Checkout, the order page, the
 * receipt and the confirmation email — web and mobile — render these constants; the mobile app
 * mirrors them in `DeliveryFeeWords.kt`, held to this file by a test.
 */
export const DELIVERY_FEE_LINE_LABEL = {
  delivery: "Delivery",
  window_surcharge: "Window surcharge",
  small_order: "Small-order fee",
  free_delivery: "Free delivery",
} as const satisfies Record<DeliveryFeeLineKind, string>;

/** The other sentences every customer surface shares. `{amount}` is replaced by the client. */
export const DELIVERY_FEE_WORDS = {
  spendMore: "Spend {amount} more for free delivery",
  freeReached: "You've got free delivery",
  smallOrder: "Orders under {amount} have a small-order fee",
  feeChanged: "The delivery fee has changed. Please check the new total.",
} as const;

/** `amount` is a signed 2-dp decimal string; only `free_delivery` is negative. */
export interface DeliveryFeeLineDTO {
  kind: DeliveryFeeLineKind;
  amount: string;
}

/**
 * What a customer is charged for delivery, in lines that sum EXACTLY to `totalAmount` (FR-028). A
 * zero line is omitted.
 *
 * ⚠ Lines and a total — nothing else. No distance, band, weight or plan may be added: a customer
 * must not be able to work out where the hub is or how the business prices (FR-032).
 */
export interface DeliveryFeeDTO {
  lines: DeliveryFeeLineDTO[];
  totalAmount: string;
}

/**
 * The business's public basket offer (077): what a cart can say before there is an address to
 * price. A null value means the rule is not set.
 */
export interface DeliveryOfferDTO {
  freeDeliveryOverAmount: string | null;
  smallOrderUnderAmount: string | null;
  smallOrderFeeAmount: string | null;
}
