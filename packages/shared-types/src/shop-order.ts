/**
 * Shop fulfilment contracts: what a shop sees of an order, its own portion and lines only. No shop
 * identifier in any request (scope comes from the operator's record), and no payment field or
 * order-level total in any response (a total would reveal other shops' lines).
 */

/**
 * The fulfilment state machine. `pending` is written at payment; `received` means a person opened it.
 * `collected` and `delivered` are written by the driver flow and are terminal.
 */
import type { DeliveredBy } from "./delivery-type";
import type { CourierPickupDTO } from "./shop-order-console";

export type FulfillmentStatus =
  | "pending"
  | "received"
  | "picking"
  | "ready_for_pickup"
  | "collected"
  | "delivered"
  /** A shop cannot supply its portion: out of the queue. Moves no money; a person decides the refund. */
  | "unfulfillable"
  /** Set by cancellation, never by a shop. Not `unfulfillable`: the shop failed nothing. */
  | "withdrawn";

/** Which slice of the queue to read. */
export type FulfillmentQueueState = "active" | "completed";

/** States that count as outstanding work vs finished business. */
export const ACTIVE_STATUSES: readonly FulfillmentStatus[] = ["pending", "received", "picking"];
export const COMPLETED_STATUSES: readonly FulfillmentStatus[] = [
  "ready_for_pickup",
  "collected",
  "delivered",
];

/**
 * What the customer bought and when this shop must be ready, read-only. `readyBy` is a constant offset
 * from placement, so ordering by promise is ordering by arrival. Who takes the package away is one of
 * two words (`deliveredBy`); no driver name, courier company or reference.
 */
export interface DeliveryPromiseDTO {
  /** Who takes this package away. Print it through `DELIVERED_BY_WORDS`. */
  deliveredBy: DeliveredBy;
  /** Present only when a courier collects this package from the shop. */
  courierPickup?: CourierPickupDTO;
  /** ISO 8601: when this shop must be ready. */
  readyBy: string;
}

/** A row in the shop's order queue (GET /shop/v1/fulfillments). */
export interface FulfillmentSummaryDTO {
  /** shop_fulfillment.id: the portion, not the order. */
  id: string;
  orderNumber: string;
  /** ISO 8601: when the customer placed the order. */
  placedAt: string;
  status: FulfillmentStatus;
  /** ISO 8601: when the portion last changed state (time-in-state). */
  stateChangedAt: string;
  /** Items this shop must gather; never the order's total count. */
  itemCount: number;
  gatheredCount: number;
  unavailableCount: number;
  promise: DeliveryPromiseDTO;
  /** Computed against the promise: drives in-place escalation, never reordering. */
  atRisk: boolean;
}

export interface FulfillmentQueueDTO {
  items: FulfillmentSummaryDTO[];
}

/** The delivery context a shop needs to prepare and label the order, snapshotted at placement. */
export interface FulfillmentDeliveryDTO {
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
 * One line to pick, in absolute quantities. On a terminal portion `orderedQuantity - gatheredQuantity`
 * is the shortfall: what the customer paid for and will not receive.
 */
export interface FulfillmentItemDTO {
  orderItemId: string;
  name: string;
  /** The variant's label as sold ("1 kg"); null with no options. A picker never guesses the size. */
  variantLabel?: string | null;
  /** Effy's code for the variant as sold (V + 6). */
  variantCode?: string | null;
  sku: string | null;
  /** The variant's barcode as sold. */
  gtin?: string | null;
  /** Presigned; may be absent. */
  imageUrl: string | null;
  orderedQuantity: number;
  gatheredQuantity: number;
  unavailableQuantity: number;
}

/** The pick screen (GET /shop/v1/fulfillments/{id}). */
export interface FulfillmentDetailDTO {
  id: string;
  /**
   * The order's own id, for routes addressed by order (`POST /shop/v1/orders/{orderId}/refunds`). Not a
   * disclosure: other shops' portions and order-level money stay absent.
   */
  orderId: string;
  orderNumber: string;
  placedAt: string;
  status: FulfillmentStatus;
  stateChangedAt: string;
  promise: DeliveryPromiseDTO;
  delivery: FulfillmentDeliveryDTO;
  /** This shop's lines only; never another shop's, never an order-level total. */
  items: FulfillmentItemDTO[];
}

/**
 * Advance or reverse a portion (POST /shop/v1/fulfillments/{id}/status). `ready_for_pickup → picking` is
 * the one reversal. `withdrawn` is never requestable: only an order's cancellation writes it.
 */
export type RequestableTransition = "picking" | "ready_for_pickup" | "unfulfillable";

export interface TransitionRequest {
  to: RequestableTransition;
  /** Required when `to` is `unfulfillable` (a check enforces it): back-office decides a refund on it. */
  reason?: string;
}

