/**
 * Shop fulfillment contracts — 020-shop-order-fulfillment.
 *
 * What a SHOP sees of a customer order: its own portion, its own lines, and nothing else. 019's
 * fan-out writes one `shop_fulfillment` per (order, shop); this is the wire shape the shop surfaces
 * read and act on.
 *
 * Two hard rules are encoded structurally rather than left to handler discipline:
 *  1. NO shop identifier appears in ANY request type here. A shop's scope is resolved server-side
 *     from the operator's record, so cross-shop access is un-representable on the wire (FR-019).
 *  2. NO payment field appears in ANY response type here — no intent id, no amount paid, no payment
 *     status, and no ORDER-level total (a total would leak the existence of other shops' lines).
 *     A shop sees only its own line values (FR-007/FR-008, SC-007).
 *
 * The delivery promise is READ-ONLY here and owned by 021-delivery-zones-pricing (FR-009a). It
 * deliberately says nothing about WHO performs the delivery — that distinction does not exist in the
 * product (FR-002a, SC-021).
 *
 * Contract detail: specs/020-shop-order-fulfillment/contracts/fulfillment-api.contract.md
 */

/**
 * The fulfillment state machine (FR-011).
 *
 * `pending` is written by the 019 fan-out. `received` was reserved by 019 and unused until now —
 * it means a human acknowledged the order, which is what distinguishes untouched work from work in
 * progress. `collected` (picked up) and `delivered` are reachable ONLY via the dev-only driver stubs
 * (FR-030) and are terminal + immutable (FR-011f) — a placeholder for the real driver slice.
 */
export type FulfillmentStatus =
  | "pending"
  | "received"
  | "picking"
  | "ready_for_pickup"
  | "collected"
  | "delivered";

export const FULFILLMENT_STATUSES: readonly FulfillmentStatus[] = [
  "pending",
  "received",
  "picking",
  "ready_for_pickup",
  "collected",
  "delivered",
];

export function toFulfillmentStatus(v: string | null | undefined): FulfillmentStatus | null {
  return v && (FULFILLMENT_STATUSES as readonly string[]).includes(v)
    ? (v as FulfillmentStatus)
    : null;
}

/** Which slice of the queue to read (FR-016). */
export type FulfillmentQueueState = "active" | "completed";

/** States that count as outstanding work vs. finished business. */
export const ACTIVE_STATUSES: readonly FulfillmentStatus[] = ["pending", "received", "picking"];
export const COMPLETED_STATUSES: readonly FulfillmentStatus[] = [
  "ready_for_pickup",
  "collected",
  "delivered",
];

/**
 * What the customer bought and when this shop must be ready — READ-ONLY (FR-009a).
 *
 * Owned by 021. While only one service level exists, `readyBy` is a constant offset from the order's
 * placement, so ordering by promise IS ordering by arrival (FR-001b, SC-020).
 *
 * Says NOTHING about who delivers. There is no carrier, driver, or provider field here, by design.
 */
export interface DeliveryPromiseDTO {
  /** e.g. "standard". A service level the customer bought — never a fulfillment mechanism. */
  serviceLevel: string;
  /** ISO-8601. The time by which THIS shop must be ready. */
  readyBy: string;
}

/** A row in the shop's order queue (GET /shop/v1/fulfillments). */
export interface FulfillmentSummaryDTO {
  /** shop_fulfillment.id — the portion, not the order. */
  id: string;
  orderNumber: string;
  /** ISO-8601, when the customer placed the order. */
  placedAt: string;
  status: FulfillmentStatus;
  /** ISO-8601, when the portion last changed state — drives time-in-state (FR-011c). */
  stateChangedAt: string;
  /** Items THIS shop must gather. Never the order's total item count. */
  itemCount: number;
  gatheredCount: number;
  unavailableCount: number;
  promise: DeliveryPromiseDTO;
  /** Computed against the promise — drives in-place escalation, never reordering (FR-001a, SC-018). */
  atRisk: boolean;
}

export interface FulfillmentQueueDTO {
  items: FulfillmentSummaryDTO[];
}

/**
 * The delivery context a shop needs to prepare and label the order (FR-009).
 * Snapshotted onto the order at placement by 019, so it never changes retroactively.
 */
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
 * One line to pick. Quantities are absolute, never deltas.
 *
 * `orderedQuantity - gatheredQuantity` on a terminal portion is the SHORTFALL — what the customer
 * paid for and will not receive. It carries no financial effect in this slice (FR-010b) and exists
 * to be resolved by a later refunds slice, which is why it must stay queryable rather than implied.
 */
export interface FulfillmentItemDTO {
  orderItemId: string;
  name: string;
  sku: string | null;
  /** Presigned; may be absent. */
  imageUrl: string | null;
  orderedQuantity: number;
  gatheredQuantity: number;
  unavailableQuantity: number;
}

/** The pick screen (GET /shop/v1/fulfillments/{id}). */
export interface FulfillmentDetailDTO {
  id: string;
  orderNumber: string;
  placedAt: string;
  status: FulfillmentStatus;
  stateChangedAt: string;
  promise: DeliveryPromiseDTO;
  delivery: FulfillmentDeliveryDTO;
  /** THIS shop's lines only. Never another shop's, and never an order-level total. */
  items: FulfillmentItemDTO[];
}

/**
 * Advance or reverse a portion (POST /shop/v1/fulfillments/{id}/status).
 *
 * Only `picking` and `ready_for_pickup` are requestable: `pending` is the fan-out's, `received` is
 * implicit on first open (FR-011a), and `collected` belongs to the pickup stub alone (FR-030).
 * `ready_for_pickup -> picking` is the ONE permitted reversal (FR-011d).
 */
export type RequestableTransition = "picking" | "ready_for_pickup";

export interface TransitionRequest {
  to: RequestableTransition;
}

/**
 * Record picking progress (PATCH /shop/v1/fulfillments/{id}/items/{orderItemId}).
 *
 * Absolute values, not deltas — idempotent under retry, which matters on a shop tablet with a flaky
 * connection. Lowering `unavailableQuantity` is how an item is un-flagged when it turns up (FR-010d).
 * `gathered + unavailable <= ordered` is enforced server-side and by a DB CHECK.
 */
export interface ItemProgressRequest {
  gatheredQuantity?: number;
  unavailableQuantity?: number;
}

/**
 * ⚠ DEV-ONLY SCAFFOLD (POST /shop/v1/fulfillments/{id}/pickup) — FR-030…FR-034.
 *
 * Stands in for a driver collecting the order so the lifecycle is exercisable before a driver
 * surface exists. The endpoint is STRUCTURALLY ABSENT outside local development (FR-031): it accepts
 * a caller-supplied identity, so a reachable deployed instance would be an order-state forgery
 * primitive. Scheduled for deletion when the driver slice ships (FR-034).
 */
export interface PickupStubRequest {
  /** Stored MARKED AS A PLACEHOLDER so stub collections never resemble a real dispatch (FR-033). */
  driverRef: string;
}
