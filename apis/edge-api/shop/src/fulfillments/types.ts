import type { CourierPickupDTO } from "@effy/shared-types";
// No request type has a `shopId` (scope comes from the operator's record via gate), and no type has
// a payment field.

import type { FieldIssue } from "../products/types";

/** The shop's lifecycle; `collected` and `delivered` are written by driver and hub work. */
export type FulfillmentStatus =
  | "pending"
  | "received"
  | "picking"
  | "ready_for_pickup"
  | "collected"
  | "delivered"
  /** A shop that cannot supply its portion moves it here. It moves no money: a person decides the refund. */
  | "unfulfillable"
  /** Set by cancellation, never by a shop, and distinct from `unfulfillable`: the shop failed at nothing. */
  | "withdrawn";

/**
 * States a client may request; the type is derived from the array so the route's runtime check can
 * never drift from it. `withdrawn` must never be added: a shop asserting it would claim a customer cancelled.
 */
export const REQUESTABLE_TRANSITIONS = ["picking", "ready_for_pickup", "unfulfillable"] as const;

export type RequestableTransition = (typeof REQUESTABLE_TRANSITIONS)[number];

export type QueueState = "active" | "completed";

export const ACTIVE_STATUSES: readonly FulfillmentStatus[] = ["pending", "received", "picking"];
export const COMPLETED_STATUSES: readonly FulfillmentStatus[] = [
  "ready_for_pickup",
  "collected",
  "delivered",
  // Both are "completed" for the shop: off the active queue, not fulfilled.
  "unfulfillable",
  "withdrawn",
];

/**
 * The legal edges as data: forward only, with one reversal. `collected`, `unfulfillable` and
 * `withdrawn` are never sources, so they are terminal. `pending → received` is implicit on first open.
 */
export const LEGAL_TRANSITIONS: ReadonlyMap<FulfillmentStatus, readonly FulfillmentStatus[]> =
  new Map([
    ["received", ["picking", "unfulfillable"] as const],
    ["picking", ["ready_for_pickup", "unfulfillable"] as const],
    // The one reversal, and `unfulfillable`: a picker can find what they gathered is unusable.
    ["ready_for_pickup", ["picking", "unfulfillable"] as const],
    // `pending` can reach it too: a shop may know before opening the order.
    ["pending", ["unfulfillable"] as const],
  ]);

export function isLegalTransition(from: FulfillmentStatus, to: FulfillmentStatus): boolean {
  return (LEGAL_TRANSITIONS.get(from) ?? []).includes(to);
}

/**
 * Who takes the package away, in one of two words: an Effy driver or a courier. No name, company or
 * tracking. A parcel a courier collects from this shop carries `courierPickup`.
 */
export interface DeliveryPromise {
  readyBy: Date;
  deliveredBy: "effy_driver" | "courier";
  /** Present only when a courier collects this package from the shop. */
  courierPickup?: CourierPickupDTO;
}

/** Counts are this shop's portion only. */
export interface FulfillmentSummary {
  id: string;
  orderNumber: string;
  placedAt: Date;
  status: FulfillmentStatus;
  stateChangedAt: Date;
  itemCount: number;
  gatheredCount: number;
  unavailableCount: number;
  promise: DeliveryPromise;
  atRisk: boolean;
}

/** Snapshotted at placement. */
export interface FulfillmentDelivery {
  recipientName: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string;
  country: string;
}

/** On a terminal portion, `orderedQuantity - gatheredQuantity` is the shortfall. */
export interface FulfillmentItem {
  orderItemId: string;
  name: string;
  variantLabel: string | null;
  /** Effy's code for the variant as sold. */
  variantCode: string | null;
  sku: string | null;
  gtin: string | null;
  imageUrl: string | null;
  orderedQuantity: number;
  gatheredQuantity: number;
  unavailableQuantity: number;
}

/** No order-level total: it would leak other shops' lines. */
export interface FulfillmentDetail {
  id: string;
  /** The order's id, for the shop refund route. */
  orderId: string;
  orderNumber: string;
  placedAt: Date;
  status: FulfillmentStatus;
  stateChangedAt: Date;
  promise: DeliveryPromise;
  delivery: FulfillmentDelivery;
  items: FulfillmentItem[];
}

export type FulfillmentErrorKind = "validation" | "conflict" | "not_found" | "unprocessable";

export class FulfillmentError extends Error {
  constructor(
    readonly kind: FulfillmentErrorKind,
    message: string,
    readonly fields?: FieldIssue[],
    /** A machine-readable refusal (`labels_not_printed`, …) sent as the problem `type`. */
    readonly code?: string,
  ) {
    super(message);
    this.name = "FulfillmentError";
  }
}

export function isFulfillmentError(err: unknown): err is FulfillmentError {
  return err instanceof FulfillmentError;
}
