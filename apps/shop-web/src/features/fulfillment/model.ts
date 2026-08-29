import type {
  DeliveryPromiseDTO,
  FulfillmentDeliveryDTO,
  FulfillmentDetailDTO,
  FulfillmentItemDTO,
  FulfillmentQueueDTO,
  FulfillmentQueueState,
  FulfillmentStatus,
  FulfillmentSummaryDTO,
  ItemProgressRequest,
  RequestableTransition,
  TransitionRequest,
} from "@effy/shared-types";

/**
 * Domain shapes for shop-web fulfillment (020, US1–US4).
 *
 * The wire DTOs (defined ONCE in `@effy/shared-types/shop-order`, FR-021) double as the domain
 * shapes here — they carry no wire-only encoding to strip. Reads/writes still route through the repo
 * layer (Principle VI), so if a DTO and its domain model ever diverge, only the repo changes.
 *
 * Two contract properties are load-bearing for everything below and are NOT re-derived client-side:
 *  - the shop's scope is resolved server-side, so no type here carries a shop identifier;
 *  - the queue's ORDER is the server's (promise, then arrival — FR-001b). The screen renders the
 *    array as handed to it and never re-sorts (SC-018).
 */
export type FulfillmentSummary = FulfillmentSummaryDTO;
export type FulfillmentQueue = FulfillmentQueueDTO;
export type FulfillmentDetail = FulfillmentDetailDTO;
export type FulfillmentItem = FulfillmentItemDTO;
export type FulfillmentDelivery = FulfillmentDeliveryDTO;
export type DeliveryPromise = DeliveryPromiseDTO;

export type {
  FulfillmentQueueState,
  FulfillmentStatus,
  ItemProgressRequest,
  RequestableTransition,
  TransitionRequest,
};

/** Human label for each state — the raw enum is a wire value, not operator copy. */
export const STATUS_LABEL: Record<FulfillmentStatus, string> = {
  pending: "New",
  received: "Received",
  picking: "Picking",
  ready_for_pickup: "Ready for pickup",
  collected: "Collected",
  delivered: "Delivered",
  // ⚠ 055 US6 — the shop's own words for its own decision.
  unfulfillable: "Can't supply",
  // ⚠ 055 US2 — NOT the shop's doing. The order was cancelled; they did not fail at anything, and a
  // label implying otherwise would be wrong on the screen the shop is judged by.
  withdrawn: "Order cancelled",
};

/**
 * Whether the operator may declare this portion unsuppliable (055 US6, FR-031).
 *
 * ⚠ MIRRORS THE SERVER'S LEGAL-EDGE MAP, and the server decides. Once collected it is no longer the
 * shop's call — the goods have left and somebody is carrying them — and both terminal states are
 * absent because a shop that said it cannot supply must not be able to un-say it: the platform may
 * already have refunded the customer on the strength of it.
 *
 * ⚠ IT MOVES NO MONEY. The control says "we cannot supply this"; a person at Effy decides the refund.
 */
export function canDeclareUnfulfillable(status: FulfillmentStatus): boolean {
  return (
    status === "pending" ||
    status === "received" ||
    status === "picking" ||
    status === "ready_for_pickup"
  );
}

/**
 * The one transition the operator may request from a given state (FR-011).
 * `pending` offers nothing — acknowledgement is implicit on open (FR-011a); `collected` is terminal
 * and immutable (FR-011f). `ready_for_pickup` offers only the single permitted reversal (FR-011d).
 */
export function nextTransition(status: FulfillmentStatus): RequestableTransition | null {
  if (status === "received") return "picking";
  if (status === "picking") return "ready_for_pickup";
  return null;
}

/** Whether the portion's lines may still be edited — picking is the only workable state. */
export function isPickable(status: FulfillmentStatus): boolean {
  return status === "picking";
}

/** A line's outstanding count: what is neither gathered nor written off as unavailable. */
export function remainingQuantity(item: FulfillmentItem): number {
  return Math.max(0, item.orderedQuantity - item.gatheredQuantity - item.unavailableQuantity);
}

/** Short, arm's-length-readable clock time for an ISO instant (FR-001a/FR-011c reading aids). */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
