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
  | "delivered"
  /**
   * ⚠ 055 US6 — THE EXIT A SHOP THAT CANNOT SUPPLY ITS PORTION PREVIOUSLY LACKED. Before it, a shop
   * holding an order it could not fill had no state to move it to: the portion sat in the queue
   * forever, and the only way out was for someone to stop looking at it.
   *
   * ⚠ IT MOVES NO MONEY (FR-031). It says "we cannot supply this"; a person decides the refund.
   */
  | "unfulfillable"
  /**
   * ⚠ 055 US2 — set by CANCELLATION, never by a shop. It is written by `core-api` when an order is
   * called off, and it is deliberately a different state from `unfulfillable`: the shop did not fail
   * to supply anything. Conflating them would tell a shop it failed at something nobody wanted, and
   * would make shop-reliability reporting count cancellations as shop failures.
   */
  | "withdrawn";

/**
 * States a client may request. `received` is implicit; `collected`/`delivered` belong to the stub.
 *
 * ⚠ THE ARRAY IS THE SOURCE AND THE TYPE IS DERIVED FROM IT, not the other way round. TypeScript
 * types do not exist at runtime, so the route's validation needs a real list — and when that list was
 * hand-written beside the union, adding `unfulfillable` to the type left the route still REJECTING
 * it. Deriving one from the other makes that impossible.
 *
 * ⚠ `withdrawn` is deliberately absent and must never be added: it is written by `core-api` when an
 * ORDER is cancelled, and a shop asserting it would be claiming a customer cancelled.
 */
export const REQUESTABLE_TRANSITIONS = ["picking", "ready_for_pickup", "unfulfillable"] as const;

export type RequestableTransition = (typeof REQUESTABLE_TRANSITIONS)[number];

export type QueueState = "active" | "completed";

export const ACTIVE_STATUSES: readonly FulfillmentStatus[] = ["pending", "received", "picking"];
export const COMPLETED_STATUSES: readonly FulfillmentStatus[] = [
  "ready_for_pickup",
  "collected",
  "delivered",
  // ⚠ BOTH ARE "COMPLETED" FROM THE SHOP'S POINT OF VIEW — meaning off the active queue, not
  // fulfilled. That is the whole point of US6: a portion nobody can fill must leave the list of work,
  // or the shop is looking at it every day with nothing they can do.
  "unfulfillable",
  "withdrawn",
];

/**
 * The legal edges of the state machine, as data rather than branching.
 *
 * Forward-only with exactly ONE reversal (FR-011d). `collected` is absent as a source, which is what
 * makes it immutable (FR-011f) — there is no entry that can move a collected portion, and that is
 * what refuses `unfulfillable` after collection (055 T074): the goods have left the shop and it is no
 * longer their call. The refusal costs no new code — the absence of a map entry IS the rule.
 *
 * ⚠ `unfulfillable` and `withdrawn` are absent as SOURCES too. Both are terminal: a shop that said it
 * cannot supply must not be able to un-say it, because the platform may already have refunded the
 * customer on the strength of it.
 * `pending -> received` is deliberately absent too: it is implicit on first open (FR-011a), never
 * requested by a client.
 */
export const LEGAL_TRANSITIONS: ReadonlyMap<FulfillmentStatus, readonly FulfillmentStatus[]> =
  new Map([
    ["received", ["picking", "unfulfillable"] as const],
    ["picking", ["ready_for_pickup", "unfulfillable"] as const],
    // ⚠ The one permitted reversal, and `unfulfillable` from here too: a picker can discover at the
    // packing bench that what they gathered is unusable.
    ["ready_for_pickup", ["picking", "unfulfillable"] as const],
    // ⚠ `pending` CAN reach it as well — a shop may know before opening the order that it cannot
    // supply it (the whole delivery is off, the chiller failed). `pending -> received` stays absent
    // because that edge is implicit on first open, never requested.
    ["pending", ["unfulfillable"] as const],
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
