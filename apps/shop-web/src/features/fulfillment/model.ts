import type {
  DeliveryPromiseDTO,
  FulfillmentDeliveryDTO,
  FulfillmentDetailDTO,
  FulfillmentItemDTO,
  FulfillmentQueueDTO,
  FulfillmentQueueState,
  FulfillmentStatus,
  FulfillmentSummaryDTO,
  RequestableTransition,
  TransitionRequest,
} from "@effy/shared-types";

/**
 * Domain shapes for fulfilment: the `@effy/shared-types/shop-order` DTOs double as them, read through the
 * repo layer. No type carries a shop identifier (scope is the server's), and the queue's order is the
 * server's (promise, then arrival): never re-sorted.
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
  RequestableTransition,
  TransitionRequest,
};

// `STATUS_LABEL` stood here (one of four maps from the shop's status to words); replaced by the
// shared `STATUS_WORD` via `PackageStatusPill`.

/**
 * Whether the operator may declare this portion unsuppliable (mirrors the server, which decides). Not once
 * collected (the goods have left), and never un-said from a terminal state (Effy may already have
 * refunded). It moves no money: a person at Effy decides the refund.
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
 * The one transition the operator may request from a given state.
 * `pending` offers nothing — acknowledgement is implicit on open; `collected` is terminal
 * and immutable. `ready_for_pickup` offers only the single permitted reversal.
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
