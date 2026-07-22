// Domain types for shop order fulfilment (020). Wire DTOs live in @effy/shared-types; nothing
// wire-shaped appears here and nothing here escapes the handler (Principle VI).
//
// The two invariants that matter are structural, not conventional:
//   * There is no `shopId` field on any REQUEST type. Shop scope is resolved from the operator's
//     record by gate() and passed as a separate argument, so a client cannot express a cross-shop
//     read (FR-019, SC-007).
//   * There is no payment field on any type. A shop never sees what the customer paid (FR-008).

import type { FieldIssue } from "../products/types";

/**
 * The shop working lifecycle (FR-011) + the dev driver stub tail. See
 * specs/020-shop-order-fulfillment/data-model.md §1. `collected` and `delivered` both belong to the
 * DEV-ONLY driver stub (no deployed route) — a placeholder for the real driver slice: picked up
 * (`collected`) → delivered (`delivered`).
 */
export type FulfillmentStatus =
  | "pending"
  | "received"
  | "picking"
  | "ready_for_pickup"
  | "collected"
  | "delivered";

/** States a client may request. `received` is implicit; `collected`/`delivered` belong to the stub. */
export type RequestableTransition = "picking" | "ready_for_pickup";

export type QueueState = "active" | "completed";

export const ACTIVE_STATUSES: readonly FulfillmentStatus[] = ["pending", "received", "picking"];
export const COMPLETED_STATUSES: readonly FulfillmentStatus[] = [
  "ready_for_pickup",
  "collected",
  "delivered",
];

/**
 * The legal edges of the state machine, as data rather than branching.
 *
 * Forward-only with exactly ONE reversal (FR-011d). `collected` is absent as a source, which is what
 * makes it immutable (FR-011f) — there is no entry that can move a collected portion.
 * `pending -> received` is deliberately absent too: it is implicit on first open (FR-011a), never
 * requested by a client.
 */
export const LEGAL_TRANSITIONS: ReadonlyMap<FulfillmentStatus, readonly FulfillmentStatus[]> =
  new Map([
    ["received", ["picking"] as const],
    ["picking", ["ready_for_pickup"] as const],
    ["ready_for_pickup", ["picking"] as const], // the one permitted reversal
  ]);

export function isLegalTransition(from: FulfillmentStatus, to: FulfillmentStatus): boolean {
  return (LEGAL_TRANSITIONS.get(from) ?? []).includes(to);
}

/** Read-only here; owned by 021 (FR-009a). Says nothing about WHO delivers (FR-002a, SC-021). */
export interface DeliveryPromise {
  serviceLevel: string;
  readyBy: Date;
}

/** A row in the shop's queue. Counts are THIS shop's portion only — never the order's totals. */
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

/** The delivery context needed to prepare and label (FR-009). Snapshotted by 019 at placement. */
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

/**
 * One line to pick. `orderedQuantity - gatheredQuantity` on a terminal portion is the SHORTFALL —
 * what the customer paid for and will not receive. No money moves for it in this slice (FR-010b).
 */
export interface FulfillmentItem {
  orderItemId: string;
  name: string;
  sku: string | null;
  imageUrl: string | null;
  orderedQuantity: number;
  gatheredQuantity: number;
  unavailableQuantity: number;
}

/** The pick screen. Contains no order-level total — that would leak other shops' lines. */
export interface FulfillmentDetail {
  id: string;
  orderNumber: string;
  placedAt: Date;
  status: FulfillmentStatus;
  stateChangedAt: Date;
  promise: DeliveryPromise;
  delivery: FulfillmentDelivery;
  items: FulfillmentItem[];
}

/** Absolute quantities, never deltas — so a retry on a flaky shop tablet is idempotent. */
export interface ItemProgress {
  gatheredQuantity?: number;
  unavailableQuantity?: number;
}

export type FulfillmentErrorKind = "validation" | "conflict" | "not_found";

/** Mirrors ProductError so the handler layer maps both uniformly. */
export class FulfillmentError extends Error {
  constructor(
    readonly kind: FulfillmentErrorKind,
    message: string,
    readonly fields?: FieldIssue[],
  ) {
    super(message);
    this.name = "FulfillmentError";
  }
}

export function isFulfillmentError(err: unknown): err is FulfillmentError {
  return err instanceof FulfillmentError;
}
