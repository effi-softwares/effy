/** Delivery fee: the customer-facing words and shapes, used by the quote and the intent. Money is a 2-dp decimal string. */

/**
 * One line of what a customer is charged for delivery:
 *  delivery the fee for distance and weight, before any window surcharge
 *  window_surcharge what the chosen window adds
 *  small_order the extra fee under the small-order amount
 *  free_delivery the saving at the free-delivery amount (negative)
 */
export type DeliveryFeeLineKind = "delivery" | "window_surcharge" | "small_order" | "free_delivery";

/** The only place these words are written: every customer surface renders them; the app mirrors them in `DeliveryFeeWords.kt` (tested). */
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
 * What a customer is charged, in lines summing exactly to `totalAmount`; zero lines are omitted. Nothing
 * else: no distance, band, weight or plan, so nobody can work out where the hub is or how pricing works.
 */
export interface DeliveryFeeDTO {
  lines: DeliveryFeeLineDTO[];
  totalAmount: string;
  /** What this shopper's delivery promotions take off this option's fee. `totalAmount` is unchanged; the promotions total is compared separately. */
  promotionAmount?: string;
}

