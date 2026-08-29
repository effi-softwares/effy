/**
 * Back-office order contracts — 053-order-lifecycle-completion.
 *
 * ⚠ A DELIBERATELY SEPARATE TYPE FAMILY FROM `order.ts`, and the separation is a safety property,
 * not tidiness. These types CARRY SHOP IDENTITY — a back-office operator must see which shop holds
 * which package to do their job. The customer's order contract in `order.ts` must NEVER learn to,
 * because Effy's whole product model hides fulfilment: a customer never discovers which shop served
 * them, nor how many did (spec FR-021).
 *
 * The cheapest way to keep that true forever is that the two families never meet — no shared base
 * interface, no `extends`, no "just add the field to the common one". 033 recorded exactly this
 * failure: `SavedItemDTO extends StorefrontProductCardDTO` dragged in a field that was being
 * replaced, and the key-set test passed because it was written from the struct instead of from the
 * contract.
 *
 * Money crosses as a 2-dp decimal string (027 R13). Never a float, never cents-as-integer.
 *
 * See specs/053-order-lifecycle-completion/contracts/back-office-orders.contract.md
 */

import type { OrderStage, OrderStatus } from "./order";
// ⚠ 055 — the refund vocabulary is SHARED with the customer contract, deliberately. A refund's
// states and reasons are one set of facts; what differs per audience is how much of it is shown,
// which is `RefundDTO` vs `CustomerRefundDTO`, not a second set of names.
import type {
  ProposedRefundDTO,
  RefundDTO,
  RefundRequestDTO,
} from "./refund";
import type { WireInt } from "./cart";

/** How an arrival came to be known (spec FR-008; `public.package_arrival.source`). */
export type ArrivalSource = "driver_proof" | "staff_recorded" | "carrier_signal";
export const ARRIVAL_SOURCES: readonly ArrivalSource[] = [
  "driver_proof",
  "staff_recorded",
  "carrier_signal",
];

/**
 * What an order is waiting on, from the operator's point of view — the console's work queue.
 *
 * ⚠ DERIVED, never stored (research R3). It is a join over the absence of a `carrier_handoff` or a
 * `package_arrival` row, which is why it can never drift from the facts it summarises.
 */
export type OrderAwaiting = "handover" | "arrival";
export const ORDER_AWAITING: readonly OrderAwaiting[] = ["handover", "arrival"];

/** A row in the back-office order list. */
export interface AdminOrderSummaryDTO {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  /** The customer-facing progress word, server-derived by `orders/stage.go`. */
  stage: OrderStage;
  placedAt: string | null;
  customerEmail: string;
  itemCount: number;
  packageCount: number;
  grandTotalAmount: string;
  currency: string;
  /** Null when nothing is outstanding — i.e. the order is finished. */
  awaiting: OrderAwaiting | null;
}

/** One shop's portion of an order, as an operator sees it. */
export interface AdminOrderPackageDTO {
  fulfillmentId: string;
  /** ⚠ Present here and ONLY here. Never on a customer-facing contract (FR-021). */
  shopId: string;
  shopName: string;
  status: string;
  itemCount: number;
  subtotalAmount: string;
  /** "same_day" | "standard" | null for a pre-047 order. Decides whether a handover applies. */
  deliveryMethod: string | null;
  handoff: CarrierHandoffDTO | null;
  arrival: PackageArrivalDTO | null;
}

/** A package's handover to an outside carrier. */
export interface CarrierHandoffDTO {
  /**
   * ⚠ NULL IS AN ORDINARY, COMPLETE STATE (FR-003) — Effy has no carrier contract, so most
   * handovers genuinely have no reference. A client MUST NOT render this as missing data, a warning,
   * or an unfinished step, and MUST NOT withhold the handover because of it.
   */
  reference: string | null;
  carrierName: string | null;
  handedOverAt: string;
  recordedBySub: string;
  note: string | null;
}

/** A package's arrival. */
export interface PackageArrivalDTO {
  arrivedAt: string;
  source: ArrivalSource;
  /** Null for `driver_proof`, where the driver is attributable through the delivery task. */
  recordedBySub: string | null;
  note: string | null;
}

/**
 * One thing that happened to an order, for the operator to scan.
 *
 * ⚠ A READ-SIDE PROJECTION over `fulfillment_event` (020), `driver_task_event` (049),
 * `carrier_handoff` and `package_arrival` — never a stored timeline. A stored one would be a fourth
 * place every state change has to be written, and the first place it gets forgotten.
 */
export interface AdminOrderHistoryEntryDTO {
  at: string;
  /** Where this entry came from, so the console can group and label without guessing. */
  kind: "fulfillment" | "driver" | "handoff" | "arrival";
  /** Human-readable summary, e.g. "Packed and ready for collection". */
  summary: string;
  /** The acting subject where one is known; null for system transitions. */
  actorSub: string | null;
  /** The package this entry concerns, when it concerns one. */
  fulfillmentId: string | null;
}

/** The back-office order detail. */
export interface AdminOrderDetailDTO {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  stage: OrderStage;
  placedAt: string | null;
  createdAt: string;

  customerId: string;
  customerEmail: string;
  customerName: string | null;

  items: AdminOrderItemDTO[];
  packages: AdminOrderPackageDTO[];
  history: AdminOrderHistoryEntryDTO[];

  itemSubtotalAmount: string;
  deliveryFeeAmount: string;
  discountAmount: string;
  promoCode: string | null;
  grandTotalAmount: string;
  currency: string;

  paymentStatus: string;
  paymentMethod: AdminPaymentMethodDTO | null;

  /** The delivery destination, as snapshotted onto the order at checkout. */
  deliveryAddress: Record<string, unknown>;
  /** Null means "same as delivery" — the console says so rather than repeating the address. */
  billingAddress: Record<string, unknown> | null;

  /** True when every package has arrived (FR-007 — a rollup, never a max). */
  finished: boolean;
  awaiting: OrderAwaiting | null;

  /**
   * 055 — the refund picture, for staff (FR-020).
   *
   * ⚠ THE OPERATOR VIEW, NOT THE CUSTOMER'S. It carries all five states including `failed` and
   * `refused`, and their `failureReason`. `CustomerRefundDTO` collapses to three and carries no
   * reason at all: a shopper told "your bank refused it" can do nothing with that, and it reads as
   * an accusation. Staff need the distinction precisely because it decides whether retrying helps.
   */
  refunds: RefundDTO[];
  /** Sum of every refund not in a terminal failure. */
  refundedAmount: string;
  /**
   * What could still be refunded — the ceiling, computed once by the server.
   *
   * ⚠ ADVISORY, NEVER THE GATE. `core-api` recomputes it inside the row lock at issue time (FR-008);
   * this figure was true when the page loaded and another operator may have spent it since. It exists
   * so the console can show a number, not so it can decide.
   */
  refundableAmount: string;
  /** Per-line remaining units, so the console never offers a unit that is already refunded. */
  refundableLines: RefundableLineDTO[];
  /**
   * Refunds the platform believes are owed but nobody has issued (FR-004a).
   *
   * ⚠ DERIVED ON EVERY READ, never stored (data-model §4). A stored proposal goes stale the moment a
   * picker corrects a shortfall, and then the console asks staff to refund something already right.
   * Only the DISMISSAL — the exception — is a row.
   */
  proposedRefunds: ProposedRefundDTO[];
  /** An open customer request, if there is one (FR-004c). */
  refundRequest: RefundRequestDTO | null;
}

/** A line with units still available to refund. */
export interface RefundableLineDTO {
  orderItemId: string;
  productName: string;
  unitPriceAmount: string;
  /** ⚠ REMAINING units, not ordered units — ordered minus already refunded. */
  quantity: WireInt;
}


/** A line on the order, for the operator. */
export interface AdminOrderItemDTO {
  orderItemId: string;
  productId: string;
  productName: string;
  unitPriceAmount: string;
  quantity: number;
  lineSubtotalAmount: string;
  /** ⚠ Operator-only, like `AdminOrderPackageDTO.shopId`. */
  shopId: string;
}

/**
 * How an order was paid.
 *
 * ⚠ NO CARD DATA BEYOND `last4`, ever — 051's rule, restated where the next person will read it.
 * There is no field here for a card number, an expiry or a cardholder name, and none may be added.
 */
export interface AdminPaymentMethodDTO {
  type: string;
  brand: string | null;
  last4: string | null;
}

/** `POST /orders/v1/fulfillments/{id}/handoff` */
export interface RecordHandoffRequest {
  reference?: string;
  carrierName?: string;
  note?: string;
  /** Per-action idempotency key, supplied by the client (027's `changeId` rule). */
  changeId: string;
}

/** `POST /orders/v1/fulfillments/{id}/arrival` */
export interface RecordArrivalRequest {
  /** ISO-8601. Omitted means "now". */
  arrivedAt?: string;
  note?: string;
  changeId: string;
}

/** The list response. */
export interface AdminOrderListResponse {
  items: AdminOrderSummaryDTO[];
  nextCursor: string | null;
}
