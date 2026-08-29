/**
 * Order & receipt contracts — 019-customer-commerce-flow.
 *
 * What the customer sees: ONE Effy order, itemized by product, NEVER by shop (FR-029). The per-shop
 * fan-out is surfaced only as anonymous fulfillment status/count/subtotal — shop identity is never
 * exposed. Amounts are decimal strings + currency (R9); the receipt reconciles to the cent (SC-008).
 *
 * Data design: see specs/019-customer-commerce-flow/data-model.md §2.4/§3.
 */

// 055 — the CUSTOMER's refund shape, shared with `refund.ts` rather than restated. The staff shape
// (`RefundDTO`) lives there too and must never reach this file: it carries the provider's failure
// text, which is staff information.
import type { CustomerRefundDTO } from "./refund";

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
  /** 027 — set when a promotional code was used, so history can mark a discounted order. */
  promoCode?: string | null;
}

/** A line on the receipt (product snapshot — never a shop). */
export interface OrderItemDTO {
  /**
   * 055 — this LINE's own id.
   *
   * ⚠ NOT INTERCHANGEABLE WITH `productId`, and the difference is load-bearing. `order_item` has no
   * uniqueness on (order, product), so two lines of the same product cannot be told apart by product
   * id. A refund request that named a product where a line was expected would not error — the join
   * would simply match nothing, and every item the shopper named would be SILENTLY DROPPED.
   *
   * ⚠ It discloses nothing: a row id on the shopper's own order, carrying no shop and no fulfilment
   * structure. The back-office contract already speaks this language.
   */
  orderItemId: string;
  productId: string;
  productName: string;
  unitPriceAmount: string;
  quantity: number;
  lineSubtotalAmount: string;
  /**
   * 052 — a short-lived presigned URL for the product's primary image, or null.
   *
   * ⚠ DECORATION ONLY, and never a carrier of meaning (FR-003). A line renders complete without it,
   * and a client MUST NOT gate any fact on its presence. It is resolved by a LEFT JOIN to the live
   * `product_media`; every other field on this line comes from the order's own immutable snapshot,
   * which is why a renamed or re-photographed product still shows what was actually bought (FR-011).
   */
  imageUrl?: string | null;
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
 * An item the customer paid for and will NOT receive (020 FR-018b).
 *
 * Disclosed at item level, but ONLY once the portion is terminal — a flag raised and then undone
 * mid-pick must never reach the customer (SC-017). Naming the customer's own item discloses nothing
 * about fulfillment structure (FR-018c).
 *
 * Carries NO refund promise: no money moves in 020, and the shortfall is left deliberately visible
 * for a later refunds slice to resolve (FR-010b, FR-018a).
 */
export interface OrderShortfallDTO {
  productName: string;
  quantity: number;
}

/**
 * An anonymous per-shop fulfillment portion — NO shop identity (FR-033).
 *
 * 020 gave `status` a life: 019 created every portion `pending` and no code path ever changed it.
 * The values now span the shop's real working lifecycle. Still no shop name, id, or count that
 * would imply WHO is fulfilling (FR-018, SC-009).
 */
export interface OrderFulfillmentDTO {
  status: "pending" | "received" | "picking" | "ready_for_pickup" | "collected" | "delivered";
  itemCount: number;
  subtotalAmount: string;
  /** Present ONLY when the portion has reached a terminal state (FR-018b). Absent while picking. */
  unavailableItems?: OrderShortfallDTO[];
}

/** Full order / receipt (GET /v1/orders/{id}). */
export interface OrderDTO {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  placedAt: string | null;
  items: OrderItemDTO[];
  /** The SHIPPING address snapshot (the main one — where the order is delivered). */
  deliveryAddress: OrderAddressDTO;
  /**
   * The BILLING address snapshot (023). `null` means "same as shipping" — the client renders
   * "Billing: same as shipping" rather than repeating the address. A value is a divergent billing
   * address. NEVER exposed to the shop (FR-018). Absent/null on pre-023 orders.
   */
  billingAddress?: OrderAddressDTO | null;
  itemSubtotalAmount: string;
  /**
   * The promotional discount applied at payment (027 FR-049). The platform's own computation at that
   * moment, stored on the order — so a receipt stays explainable years later even if the code has since
   * been changed or disabled. "0.00" (or absent, on a pre-027 order) when no code was used.
   * Invariant: grandTotal = itemSubtotal − discount. (There is no delivery fee on this platform.)
   */
  discountAmount?: string;
  /**
   * 051 FR-043 — the delivery fee as charged.
   *
   * ⚠ The column has existed since 019 and the receipt read never selected it, so delivery sat inside
   * the total and appeared nowhere. A receipt whose lines do not add up to its total is not one a
   * shopper can check — and for a GST-inclusive Australian sale that is a real gap, not a cosmetic one.
   */
  deliveryFeeAmount?: string;
  /**
   * The literal code used, denormalised beside the discount so the receipt can still say "SPRING20"
   * independently of the promotion record. Null/absent when no code was used.
   */
  promoCode?: string | null;
  grandTotalAmount: string;
  currency: string;
  paymentStatus: PaymentStatus;
  fulfillments: OrderFulfillmentDTO[];

  /**
   * 052 — the customer-facing progress stage (FR-008).
   *
   * ⚠ SERVER-DERIVED, ALWAYS. Clients render this; no client computes it from `fulfillments`. Two
   * clients deriving one answer independently is 029's banner target and 033's `available` flag, and
   * the failure is silent because both surfaces still render *something*.
   *
   * ⚠ It is a ROLLUP, NOT A MAX: a two-shop order with one portion delivered and one still being
   * picked is `packing`. The customer has not received their order.
   */
  stage: OrderStage;

  /**
   * 055 — may the SHOPPER still cancel this order themselves? (FR-012)
   *
   * ⚠ SERVER-DERIVED, for exactly the reason `stage` above is: a client computing it from
   * `fulfillments` would be a second implementation of one rule, and the divergence would be silent
   * because both surfaces still render *something*. Here the cost is a shopper shown a cancel button
   * that refuses, or denied one that would have worked.
   *
   * ⚠ ADVISORY, NOT THE GATE. It was true when the page loaded; a shop may have begun picking since,
   * and the server re-decides inside a row lock when the cancel actually arrives (FR-017).
   *
   * ⚠ `false` DOES NOT MEAN "this order can never be cancelled" — staff can cancel at any pre-departure
   * stage (FR-018). Any wording built on this must leave that door open, or a shopper who would have
   * rung up simply gives up.
   */
  cancellable: boolean;

  /**
   * 055 — every refund on this order, newest first (FR-023).
   *
   * ⚠ ABSENT ENTIRELY when nothing was refunded — not an empty array (FR-028, SC-011). An order with
   * no refunds serialises byte-identically to its pre-055 self, so a client that has never seen one
   * cannot tell this slice shipped, and renders nothing rather than an empty section.
   *
   * ⚠ NO FAILURE REASON, NO KIND, NO PROVIDER REFERENCE. See [CustomerRefundDTO].
   */
  refunds?: CustomerRefundDTO[];

  /** What has actually been returned or is on its way. Absent when there are no refunds. */
  refundedTotal?: string;

  /**
   * What the shopper is out of pocket after refunds.
   *
   * ⚠ NOT A CORRECTION TO `grandTotalAmount` (FR-024). That figure is what was CHARGED — a historical
   * record. A receipt that silently rewrote itself after a refund could not be reconciled against a
   * bank statement, which is the one thing a receipt is for.
   */
  amountPaidAfterRefunds?: string;

  /**
   * ⚠ DERIVED FROM THE TOTALS, never a stored flag — so reaching it line by line and reaching it in
   * one act are the same fact. A flag could be true while the numbers disagreed, and then nobody
   * knows which to believe.
   */
  fullyRefunded?: boolean;

  /**
   * 052 — how the order was paid, in a form safe to display (FR-006). Null when not captured: a
   * pre-052 order, or an order whose post-commit capture failed. The receipt omits the line rather
   * than showing a blank.
   */
  paymentMethod?: PaymentMethodSummaryDTO | null;

  /**
   * 052 — when the order is expected to arrive (FR-007), one entry per package.
   *
   * ⚠ More than one entry means the order arrives in more than one delivery — a fact about the
   * CUSTOMER'S experience, not about fulfilment structure. It carries no shop reference of any kind
   * (FR-009), and the entries are deliberately unordered with respect to any internal grouping.
   */
  arrivalEstimates: ArrivalEstimateDTO[];
}

/**
 * 052 — the customer-facing progress vocabulary (FR-008). A CLOSED union, derived server-side from
 * every `shop_fulfillment.status` on the order. See `apis/core-api/internal/features/orders/stage.go`
 * for the single rollup that produces it.
 */
export type OrderStage = "confirmed" | "packing" | "on_the_way" | "delivered";
export const ORDER_STAGES: readonly OrderStage[] = [
  "confirmed",
  "packing",
  "on_the_way",
  "delivered",
];

/**
 * 052 — a short, non-sensitive description of how an order was paid.
 *
 * ⚠ NO CARD DATA BEYOND `last4`, ever (051 `payment.ts`). There is no field for a card number, an
 * expiry, or a cardholder name, and none may be added.
 */
export interface PaymentMethodSummaryDTO {
  /** Effy's own family, never the provider's string. */
  type: "card" | "wallet" | "pay_over_time" | "other";
  /** Network or wallet for the label ("visa", "apple_pay"). Null when the family carries no brand. */
  brand: string | null;
  /** The ONLY part of a card number permitted to leave the provider. Null for non-card families. */
  last4: string | null;
}

/**
 * 052 — when one package is expected to ARRIVE, as the customer was shown at checkout.
 *
 * ⚠ NOT `DeliveryPromiseDTO`, which already exists in `shop-order.ts` and is a DIFFERENT FACT FOR A
 * DIFFERENT AUDIENCE: that one carries `readyBy`, the time this shop must have the package ready at
 * the fulfilment node. Research R4 records that the ready-by must never reach the customer — it means
 * something else, and it is fulfilment structure (FR-009). The names are kept apart deliberately so
 * the two can never be swapped by autocomplete.
 *
 * ⚠ DATES, NOT TIMES. `promisedFrom`/`promisedTo` are ISO dates (yyyy-mm-dd) because the underlying
 * `order_package_delivery.promised_from`/`.promised_to` are `date` columns — the platform has no
 * delivery time window and cannot derive one. A client MUST NOT render a time here.
 */
export interface ArrivalEstimateDTO {
  /** The method the customer chose for this package. */
  method: "same_day" | "scheduled" | "standard";
  promisedFrom: string | null;
  promisedTo: string | null;
}

/** Receipt is the same shape as the full order detail. */
export type ReceiptDTO = OrderDTO;
