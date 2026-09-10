// Domain types for the shop ORDER CONSOLE (057 Amendment A3). Wire DTOs live in @effy/shared-types
// (`shop-order-console`); nothing wire-shaped escapes the handler (Principle VI).
//
// ⚠ A SIBLING OF `fulfillments/`, NOT A REPLACEMENT. The pick routes (`/shop/v1/fulfillments…`) are
// read by shop-mobile through a generated Kotlin contract and keep 020's rule that a shop sees no
// order money. The console routes (`/shop/v1/orders…`) are shop-web's, and carry the order's money
// by operator decision (A3). Keeping them in separate modules is what lets one rule relax without the
// other noticing.
//
// Still structural here, as in `fulfillments/`: no request type carries a shop id (scope comes from
// gate()), and nothing names the order's second address — the no-second-address guard reads this
// directory too (023 FR-018).

import type { FulfillmentDelivery, FulfillmentStatus } from "../fulfillments/types";

export type OrderTab =
  | "all"
  | "new"
  | "picking"
  | "ready_for_pickup"
  | "collected"
  | "delivered"
  | "unfulfillable"
  | "withdrawn";

export const ORDER_TABS: readonly OrderTab[] = [
  "all",
  "new",
  "picking",
  "ready_for_pickup",
  "collected",
  "delivered",
  "unfulfillable",
  "withdrawn",
];

export type PaymentState = "paid" | "refund_pending" | "partially_refunded" | "refunded";
export const PAYMENT_STATES: readonly PaymentState[] = [
  "paid",
  "refund_pending",
  "partially_refunded",
  "refunded",
];

export type Attention = "any" | "at_risk" | "short" | "on_track";
export const ATTENTIONS: readonly Attention[] = ["any", "at_risk", "short", "on_track"];

export type Method = "any" | "same_day" | "standard";
export const METHODS: readonly Method[] = ["any", "same_day", "standard"];

export type Range = "any" | "today" | "7d" | "30d";
export const RANGES: readonly Range[] = ["any", "today", "7d", "30d"];

export type SortKey = "placed" | "number" | "customer" | "items" | "total";
export const SORT_KEYS: readonly SortKey[] = ["placed", "number", "customer", "items", "total"];

/** A fully-defaulted list query. The handler parses; nothing here is optional. */
export interface OrderListQuery {
  tab: OrderTab;
  q: string;
  attention: Attention;
  payment: PaymentState | "any";
  method: Method;
  range: Range;
  sort: SortKey;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
}

export interface OrderRow {
  id: string;
  orderNumber: string;
  customerName: string;
  placedAt: Date;
  status: FulfillmentStatus;
  itemCount: number;
  gatheredCount: number;
  unavailableCount: number;
  deliveryMethod: "same_day" | "standard" | null;
  atRisk: boolean;
  payment: PaymentState;
  total: string;
  currency: string;
  tags: string[];
  /** "Eggs ×2, Oat milk ×1" — this shop's lines, for the list's Items column. */
  itemsSummary: string;
}

export interface OrderList {
  items: OrderRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<OrderTab, number>;
}

export interface OrderLine {
  orderItemId: string;
  name: string;
  sku: string | null;
  imageUrl: string | null;
  orderedQuantity: number;
  gatheredQuantity: number;
  unavailableQuantity: number;
  refundedQuantity: number;
  unitPrice: string;
  lineTotal: string;
  /** The picker's note from "Adjust this line", if any. */
  pickNote: string | null;
}

export interface OrderRefund {
  id: string;
  amount: string;
  status: "submitting" | "submitted" | "succeeded" | "failed" | "refused";
  reason: "item_not_supplied" | "item_unusable" | "order_cancelled" | "goodwill" | "external";
  actorKind: "back_office" | "customer" | "shop" | "system";
  actorLabel: string | null;
  createdAt: Date;
}

export interface OrderNote {
  id: string;
  body: string;
  authorLabel: string | null;
  createdAt: Date;
}

export interface OrderDetail {
  id: string;
  orderId: string;
  orderNumber: string;
  placedAt: Date;
  status: FulfillmentStatus;
  stateChangedAt: Date;
  readyBy: Date;
  deliveryMethod: "same_day" | "standard" | null;
  atRisk: boolean;
  delivery: FulfillmentDelivery;
  lines: OrderLine[];
  money: {
    currency: string;
    shopSubtotal: string;
    itemSubtotal: string;
    deliveryFee: string;
    discount: string;
    promoCode: string | null;
    total: string;
    refunded: string;
    refundPending: string;
    net: string;
  };
  payment: {
    state: PaymentState;
    methodType: string | null;
    methodBrand: string | null;
    methodLast4: string | null;
    amount: string;
    paidAt: Date | null;
  };
  refunds: OrderRefund[];
  handoff: {
    collectedAt: Date | null;
    deliveredAt: Date | null;
    unfulfillableReason: string | null;
  };
  tags: string[];
  notes: OrderNote[];
}

export interface ActivityEntry {
  id: string;
  at: Date;
  title: string;
  actorLabel: string | null;
  /** `negative` — something the customer will not get (unavailable, can't supply, cancelled). */
  tone: "strong" | "quiet" | "negative";
}

/** Limits, mirrored from `@effy/shared-types` so the console refuses exactly what this refuses. */
export { SHOP_ORDER_NOTE_MAX_LENGTH, SHOP_ORDER_TAG_MAX, SHOP_ORDER_TAG_MAX_LENGTH } from "@effy/shared-types";
