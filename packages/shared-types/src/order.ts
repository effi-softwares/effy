/**
 * Order & receipt contracts — 019-customer-commerce-flow.
 *
 * What the customer sees: ONE Effy order, itemized by product, NEVER by shop (FR-029). The per-shop
 * fan-out is surfaced only as anonymous fulfillment status/count/subtotal — shop identity is never
 * exposed. Amounts are decimal strings + currency (R9); the receipt reconciles to the cent (SC-008).
 *
 * Data design: see specs/019-customer-commerce-flow/data-model.md §2.4/§3.
 */

/** Order lifecycle mirrored to the client (payment-driven). */
export type OrderStatus = "pending_payment" | "paid" | "failed" | "canceled";
export const ORDER_STATUSES: readonly OrderStatus[] = [
  "pending_payment",
  "paid",
  "failed",
  "canceled",
];
export function toOrderStatus(v: string | null | undefined): OrderStatus | null {
  return v && (ORDER_STATUSES as readonly string[]).includes(v) ? (v as OrderStatus) : null;
}

/** Payment outcome mirrored from the Stripe PaymentIntent. */
export type PaymentStatus =
  | "requires_payment"
  | "requires_action"
  | "succeeded"
  | "failed"
  | "canceled";
export const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  "requires_payment",
  "requires_action",
  "succeeded",
  "failed",
  "canceled",
];

/** A row in the order history (GET /v1/orders). */
export interface OrderSummaryDTO {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  placedAt: string | null;
  itemCount: number;
  grandTotalAmount: string;
  currency: string;
}

/** A line on the receipt (product snapshot — never a shop). */
export interface OrderItemDTO {
  productId: string;
  productName: string;
  unitPriceAmount: string;
  quantity: number;
  lineSubtotalAmount: string;
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

/** An anonymous per-shop fulfillment portion — NO shop identity (FR-033). */
export interface OrderFulfillmentDTO {
  status: "pending" | "received";
  itemCount: number;
  subtotalAmount: string;
}

/** Full order / receipt (GET /v1/orders/{id}). */
export interface OrderDTO {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  placedAt: string | null;
  items: OrderItemDTO[];
  deliveryAddress: OrderAddressDTO;
  itemSubtotalAmount: string;
  deliveryFeeAmount: string;
  grandTotalAmount: string;
  currency: string;
  paymentStatus: PaymentStatus;
  fulfillments: OrderFulfillmentDTO[];
}

/** Receipt is the same shape as the full order detail. */
export type ReceiptDTO = OrderDTO;
