/**
 * Order and receipt contracts. The customer sees one Effy order, itemised by product, never by shop;
 * the per-shop fan-out shows only as anonymous fulfilment portions. Amounts are decimal strings plus
 * currency, and the receipt reconciles to the cent.
 */

// The customer's refund shape, from `refund.ts`. The staff `RefundDTO` must never reach this file (it carries provider failure text).
import type { OrderPaymentSplitDTO } from "./points";
import type { CustomerRefundDTO } from "./refund";
import type { DeliveryFeeDTO } from "./delivery-fee";
import type { DeliveryInstructionsDTO } from "./delivery-instructions";
import type { OrderDeliveryDTO } from "./delivery-type";

/** Order lifecycle mirrored to the client (payment-driven). */
export type OrderStatus = "pending_payment" | "paid" | "failed" | "canceled";
/** Payment outcome mirrored from the Stripe PaymentIntent. */
export type PaymentStatus =
  | "requires_payment"
  | "requires_action"
  | "succeeded"
  | "failed"
  | "canceled";
/** A row in the order history (GET /v1/orders). */
export interface OrderSummaryDTO {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  placedAt: string | null;
  itemCount: number;
  grandTotalAmount: string;
  currency: string;
  /** Set when a promotional code was used, so history can mark a discounted order. */
  promoCode?: string | null;
  /** Who delivers it. */
  delivery: OrderDeliveryDTO;
  /**
   * The primary picture of the order's first few lines (at most four), for the order list: short-lived
   * presigned URLs from the live catalogue; `null` where a line has none. Never a shop, a package, or a
   * supplier count.
   */
  thumbnails?: (string | null)[];
  /** Index-aligned with `thumbnails`: each one's smaller copies (see `imageWidths`). */
  thumbnailWidths?: number[][];
  /**
   * What the order list says beside the totals. Each is absent (never empty or false) when it does not
   * apply, and derived by the receipt's own function, so list and page agree.
   */
  /** The one word for where a paid order is. Absent on an unpaid, failed or cancelled order. */
  stage?: OrderStage;
  /** The promise the order was sold, as on the receipt. Absent for a courier order. */
  arrivalEstimates?: ArrivalEstimateDTO[];
  /** When the whole order had arrived (ISO); only once `stage` is `delivered`. */
  deliveredAt?: string;
  /** What has gone back to the customer so far. Absent when nothing has. */
  refundedTotal?: string;
  /** The whole amount has gone back. */
  fullyRefunded?: true;
}

/** A line on the receipt: a product snapshot, never a shop. */
export interface OrderItemDTO {
  /**
   * This line's own id. Not interchangeable with `productId`: two lines of one product cannot be told
   * apart by product id, and a refund request naming a product would silently match nothing. Discloses
   * nothing about fulfilment.
   */
  orderItemId: string;
  productId: string;
  /** The variant sold. */
  variantId: string;
  productName: string;
  /** The variant's label as sold ("Spiced / 500 g"); null for a product with no options. */
  variantLabel: string | null;
  unitPriceAmount: string;
  quantity: number;
  lineSubtotalAmount: string;
  /**
   * A short-lived presigned URL for the product's primary image, or null. Decoration only: a line is
   * complete without it. It comes from the live catalogue; every other field is the order's snapshot,
   * so a renamed product still shows what was bought.
   */
  imageUrl?: string | null;
  /** Widths (px) of this picture's smaller copies, ascending; absent or [] means only `imageUrl`. Build each with `renditionUrl`. */
  imageWidths?: number[];
  /** What promotions took off this line, as sold. Absent or "0.00" when none. */
  discountAmount?: string;
}

/** One promotion applied to an order, as sold (never re-derived). */
export interface OrderPromotionDTO {
  headline: string;
  code: string | null;
  goodsAmount: string;
  deliveryAmount: string;
}

/** The snapshotted delivery address on the receipt. */
export interface OrderAddressDTO {
  recipientName: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string;
  country: string;
}

/**
 * An item the customer paid for and will not receive, disclosed only once the portion is terminal (a
 * flag raised and undone mid-pick never reaches the customer). Carries no refund promise.
 */
export interface OrderShortfallDTO {
  productName: string;
  quantity: number;
}

/** An anonymous fulfilment portion: no shop name, id, or anything implying who fulfils it. */
export interface OrderFulfillmentDTO {
  status: "pending" | "received" | "picking" | "ready_for_pickup" | "collected" | "delivered";
  itemCount: number;
  subtotalAmount: string;
  /** Present only once the portion is terminal; absent while picking. */
  unavailableItems?: OrderShortfallDTO[];
}

/** Full order / receipt (GET /v1/orders/{id}). */
export interface OrderDTO {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  placedAt: string | null;
  items: OrderItemDTO[];
  /** The shipping address snapshot, where the order is delivered. */
  deliveryAddress: OrderAddressDTO;
  /** The billing address snapshot; `null` means same as shipping. Never exposed to a shop. */
  billingAddress?: OrderAddressDTO | null;
  /** What the customer told the driver, or null. Fixed once paid. Render nothing for null, and `note` as plain text. */
  deliveryInstructions?: DeliveryInstructionsDTO | null;
  itemSubtotalAmount: string;
  /** The promotional discount as computed at payment and stored, so the receipt stays explainable after a promotion changes. "0.00" when none. */
  discountAmount: string;
  /** Each promotion applied and what it took off. */
  promotions: OrderPromotionDTO[];
  /** What delivery promotions took off the fee. */
  deliveryDiscountAmount: string;
  /** The delivery fee as charged. */
  deliveryFeeAmount: string;
  /** The same charge as lines (delivery, window surcharge, small-order fee, free delivery), as sold and never recomputed. */
  deliveryFee: DeliveryFeeDTO;
  /** The code used, kept beside the discount so the receipt can still say "SPRING20"; null when none. */
  promoCode?: string | null;
  grandTotalAmount: string;
  currency: string;
  paymentStatus: PaymentStatus;
  fulfillments: OrderFulfillmentDTO[];

  /**
   * The customer-facing progress stage, always server-derived (never computed from `fulfillments`). A
   * rollup, not a max: a two-shop order with one portion delivered and one being picked is `packing`.
   */
  stage: OrderStage;

  /**
   * May the shopper still cancel this order themselves? Server-derived and advisory: the server decides
   * again under a row lock. `false` does not mean it can never be cancelled (staff can, before it
   * leaves), so wording must leave that door open.
   */
  cancellable: boolean;

  /**
   * Every refund on this order, newest first. Absent entirely (not an empty array) when nothing was
   * refunded. No failure reason, kind or provider reference (see [CustomerRefundDTO]).
   */
  refunds?: CustomerRefundDTO[];

  /** What has been returned or is on its way. Absent with no refunds. */
  refundedTotal?: string;

  /**
   * What the shopper is out of pocket after refunds. Not a correction to `grandTotalAmount`, which is what
   * was charged: a receipt must reconcile against a bank statement.
   */
  amountPaidAfterRefunds?: string;

  /** Derived from the totals, never stored, so line-by-line and all-at-once reach the same fact. */
  fullyRefunded?: boolean;

  /** How the order was paid, safe to display; null when the post-commit capture failed (the receipt omits the line). */
  paymentMethod?: PaymentMethodSummaryDTO | null;
  /** How the order was paid when points were part of it, and what has come back. Absent with no points; points are a way of paying, never a discount. */
  paymentSplit?: OrderPaymentSplitDTO;

  /**
   * When the order is expected to arrive. Carries no shop reference. Empty for a courier order, which has
   * no window or day: read `delivery` and print `deliverySummary`.
   */
  arrivalEstimates: ArrivalEstimateDTO[];
  /** Who delivers the order, and for a courier the estimate sold; printed through `deliverySummary`. */
  delivery: OrderDeliveryDTO;
}

/**
 * The customer-facing progress vocabulary: a closed union rolled up server-side from every
 * `shop_fulfillment.status` (`stageFor` in `apis/edge-api/shared/src/lib/order-completion.ts`).
 */
export type OrderStage = "confirmed" | "packing" | "on_the_way" | "delivered";
/** How an order was paid, safe to show. No card data beyond `last4`, ever. */
export interface PaymentMethodSummaryDTO {
  /** Effy's own family, never the provider's string. */
  type: "card" | "wallet" | "pay_over_time" | "other";
  /** Network or wallet for the label ("visa", "apple_pay"). Null when the family carries no brand. */
  brand: string | null;
  /** The only part of a card number allowed to leave the provider; null for non-card families. */
  last4: string | null;
}

/**
 * When one package is expected to arrive, as shown at checkout. Not `DeliveryPromiseDTO` (shop-order.ts),
 * which is the shop's ready-by and must never reach a customer.
 *
 * `promisedFrom`/`promisedTo` are the delivery day (yyyy-mm-dd), equal for a sold window or day; null
 * means the date will be confirmed (never invent one). `windowStart`/`windowEnd` are the window sold,
 * null for an untimed day. Render through `formatArrival`.
 */
export interface ArrivalEstimateDTO {
  /** The method the customer chose for this package. */
  method: "same_day" | "scheduled" | "standard";
  promisedFrom: string | null;
  promisedTo: string | null;
  /** ISO datetimes with the Australia/Melbourne offset, or null. */
  windowStart: string | null;
  windowEnd: string | null;
}

