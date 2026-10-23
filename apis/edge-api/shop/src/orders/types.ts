import type { CourierPickupDTO, ParcelZone, ShopLabelCommonDTO, ShopParcelLabelDTO } from "@effy/shared-types";
// The order console's routes (`/shop/v1/orders…`) carry the order's money by operator decision; the
// pick routes (`fulfillments/`) do not, and the two modules stay separate so that rule cannot leak. No
// request type carries a shop id, and nothing names the payer's address (the address guard reads this directory).

import type { PackageStatusView } from "@effy/shared-types";
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

export type DeliveredByFilter = "any" | "effy_driver" | "courier";
export const DELIVERED_BY_FILTERS: readonly DeliveredByFilter[] = ["any", "effy_driver", "courier"];

export type Range = "any" | "today" | "7d" | "30d";
export const RANGES: readonly Range[] = ["any", "today", "7d", "30d"];

export type SortKey = "placed" | "number" | "customer" | "items" | "total";
export const SORT_KEYS: readonly SortKey[] = ["placed", "number", "customer", "items", "total"];

/** Fully defaulted; nothing here is optional. */
export interface OrderListQuery {
  tab: OrderTab;
  q: string;
  attention: Attention;
  payment: PaymentState | "any";
  deliveredBy: DeliveredByFilter;
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
  /** Shop audience: never a driver's name. */
  statusView: PackageStatusView;
  itemCount: number;
  gatheredCount: number;
  unavailableCount: number;
  /** The only thing a shop is told about delivery. */
  deliveredBy: "effy_driver" | "courier";
  /** Present only when a courier collects this package from the shop. */
  courierPickup?: CourierPickupDTO;
  atRisk: boolean;
  payment: PaymentState;
  total: string;
  currency: string;
  tags: string[];
  /** "Eggs ×2, Oat milk ×1": this shop's lines. */
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
  /** As sold; null with no options. */
  variantLabel: string | null;
  /** Effy's code as sold. */
  variantCode: string | null;
  sku: string | null;
  /** As sold. */
  gtin: string | null;
  imageUrl: string | null;
  orderedQuantity: number;
  gatheredQuantity: number;
  unavailableQuantity: number;
  refundedQuantity: number;
  unitPrice: string;
  lineTotal: string;
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
  statusView: PackageStatusView;
  stateChangedAt: Date;
  readyBy: Date;
  /** The only thing a shop is told about delivery. */
  deliveredBy: "effy_driver" | "courier";
  /** Present only when a courier collects this package from the shop. */
  courierPickup?: CourierPickupDTO;
  atRisk: boolean;
  delivery: FulfillmentDelivery;
  parcels: ShopParcelLabelDTO[];
  labelCommon: ShopLabelCommonDTO;
  zonesNeeded: ParcelZone[];
  /** Every bag must be scanned as packed before ready. */
  packScanRequired: boolean;
  lines: OrderLine[];
  money: {
    currency: string;
    shopSubtotal: string;
    itemSubtotal: string;
    discount: string;
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
  /** Something the customer will not get. */
  tone: "strong" | "quiet" | "negative";
}

/** Mirrored from `@effy/shared-types` so the console refuses exactly what this refuses. */
export { SHOP_ORDER_NOTE_MAX_LENGTH, SHOP_ORDER_TAG_MAX, SHOP_ORDER_TAG_MAX_LENGTH } from "@effy/shared-types";
