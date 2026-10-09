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

import type { OrderPaymentSplitDTO } from "./points";
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
import type { DeliveryFeeLineDTO } from "./delivery-fee";
import type { DeliveryInstructionsDTO } from "./delivery-instructions";
import type { DeliveryType, DeliveryTypeReason } from "./delivery-type";
import type { DeliveryWindow } from "./delivery-window";
import type { PackageStatusView } from "./package-status";

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
export type OrderAwaiting =
  | "handover"
  | "arrival"
  /**
   * 055 US6 — a shop said it cannot supply its portion and nobody has decided what to do about it.
   *
   * ⚠ IT RANKS ABOVE THE OTHER TWO because it is the only one where a CUSTOMER IS OUT OF POCKET while
   * the queue waits. A package awaiting handover or arrival is late; a package nobody can supply is
   * money the platform is holding for goods that will never be sent.
   */
  | "refund_decision";
export const ORDER_AWAITING: readonly OrderAwaiting[] = ["refund_decision", "handover", "arrival"];

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
  /**
   * 073 — where the order is, in staff words: its least advanced package (a Problem anywhere wins).
   * Null for an order with no packages yet.
   */
  statusView: PackageStatusView | null;
  /** 073 — the drivers collecting and delivering this order's packages, by name, without repeats. */
  drivers: { collect: string[]; deliver: string[] };
  /** 073 — some package is waiting for a driver and nobody has it. */
  needsDriver: boolean;
  /** 079 — who delivers the order. Null for an order placed before 079. */
  deliveryType: DeliveryType | null;
}

/** 079 — the order list's delivery filter. `legacy` = placed before 079 (no delivery type). */
export const ADMIN_ORDER_DELIVERY_FILTERS = ["effy", "courier", "legacy"] as const;
export type AdminOrderDeliveryFilter = (typeof ADMIN_ORDER_DELIVERY_FILTERS)[number];

/** 079 — one entry in an order's delivery-type history: the checkout's decision, then any change. */
export interface DeliveryTypeChangeDTO {
  /** Null on the first entry. */
  from: DeliveryType | null;
  to: DeliveryType;
  reason: DeliveryTypeReason;
  /** The checkout decided, or a staff member changed it (their auth subject, as other audit lists carry it). */
  actor: { kind: "checkout" } | { kind: "staff"; sub: string };
  note: string | null;
  at: string;
}

/** One shop's portion of an order, as an operator sees it. */
export interface AdminOrderPackageDTO {
  /**
   * 073 — where this package really is: derived from collection, hub check-in, delivery and
   * carrier records, not from `status` (the shop's own status, which stops at `collected`).
   */
  statusView: PackageStatusView | null;
  /** 073 — who is collecting it; null when it is not yet (or no longer) a collection matter. */
  collect: OrderAssignment | null;
  /** 073 — who is delivering it (same-day only); null for standard, or before it reaches the hub. */
  deliver: OrderAssignment | null;
  fulfillmentId: string;
  /** ⚠ Present here and ONLY here. Never on a customer-facing contract (FR-021). */
  shopId: string;
  shopName: string;
  status: string;
  itemCount: number;
  subtotalAmount: string;
  /**
   * 079 — who takes this package to the customer, for EVERY order old or new
   * (`public.package_delivered_by`). ⚠ This — not `deliveryMethod`, not `window` — decides whether a
   * carrier handover applies: a "standard" package sold a window is Effy's.
   */
  deliveredBy: DeliveryType;
  /** "same_day" | "standard" | null for a pre-047 order. The CUSTOMER'S word; see `deliveredBy`. */
  deliveryMethod: string | null;
  handoff: CarrierHandoffDTO | null;
  arrival: PackageArrivalDTO | null;
  /** 069 — the delivery day the customer was promised (yyyy-mm-dd), or null for an earlier order. */
  promisedDate: string | null;
  /** 069 — the same-day window the customer was sold, or null. */
  window: DeliveryWindow | null;
  /** 069 — a late payer took this order's slot over its capacity (FR-009b). Staff-only. */
  overCapacity: boolean;
  /**
   * 069 — the day a STANDARD package must be handed to the carrier to arrive on `promisedDate`
   * (that day minus the carrier lead time). Null for same-day and for earlier orders.
   */
  handoverDueOn: string | null;
  /** 069 — past `handoverDueOn` with no handover, or handed over after it. Derived on read. */
  atRisk: boolean;
  /**
   * 069 — whether it arrived inside its window (same-day) or on its day (standard). Null until it
   * has arrived, and for an order with no promise to judge against.
   */
  onTime: boolean | null;
}

/** One standard package on the carrier handover list (069 US7). */
export interface HandoverRowDTO {
  fulfillmentId: string;
  orderId: string;
  orderNumber: string;
  /** Null for an order sold as a courier delivery (079): the customer was told an estimate, not a day. */
  promisedDate: string | null;
  handoverDueOn: string;
  atRisk: boolean;
  /** Checked in at the hub. False means it has not arrived there yet and cannot be handed over. */
  atHub: boolean;
}

export type HandoverDueFilter = "today" | "overdue" | "upcoming";

export interface HandoverListResponse {
  items: HandoverRowDTO[];
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
 * ⚠ A READ-SIDE PROJECTION over `fulfillment_event` (020), `carrier_handoff` and `package_arrival`
 * — never a stored timeline. A stored one would be a fourth place every state change has to be
 * written, and the first place it gets forgotten.
 *
 * ⚠ `kind: "driver"` IS KEPT THOUGH NOTHING EMITS IT, and that is a considered exception to this
 * repo's rule against dormant vocabulary. Its source was `driver_task_event`, dropped with the 049
 * work model. The rule exists because a type nothing can populate quietly contradicts the live
 * contract (059's fourth `device_token.platform` reader); here the opposite risk is larger — this
 * union is the projection's source list, the projection is DESIGNED to gain and lose sources, and
 * narrowing it now would force a change to the console's label map for no gain and a second change
 * back when dispatch lands.
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
  /** 079 — who delivers the order; null for an order placed before 079 (nothing below is then set). */
  deliveryType: DeliveryType | null;
  deliveryTypeReason: DeliveryTypeReason | null;
  /** 079 — the courier timeframe as it was SOLD; null unless a courier delivers. */
  courierEstimate: string | null;
  /** 079 — oldest first. Empty for an order placed before 079: its history is not invented. */
  deliveryTypeHistory: DeliveryTypeChangeDTO[];

  customerId: string;
  customerEmail: string;
  customerName: string | null;
  /**
   * 074 — how the order was paid when points were part of it, and what has come back of each. Absent
   * on an order that used no points.
   */
  paymentSplit?: OrderPaymentSplitDTO;

  items: AdminOrderItemDTO[];
  packages: AdminOrderPackageDTO[];
  history: AdminOrderHistoryEntryDTO[];

  itemSubtotalAmount: string;
  deliveryFeeAmount: string;
  /**
   * 077 — how `deliveryFeeAmount` was built, exactly as stored when the order was placed (FR-037).
   * Absent on an order placed before 077.
   */
  deliveryFeeBreakdown?: DeliveryFeeBreakdownDTO;
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
  /**
   * 066 — the customer's instructions to the driver, as given at placement; null/absent when none.
   * ⚠ Customer-authored free text: render as a text node, never as markup.
   */
  deliveryInstructions?: DeliveryInstructionsDTO | null;

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
   * ⚠ ADVISORY, NEVER THE GATE. The server recomputes it inside the row lock at issue time (FR-008);
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

/**
 * 077 — the whole of a placed order's delivery charge: which plan priced it, from what, and every
 * step. Written once at the intent call and never recomputed (FR-034/FR-036).
 *
 * ⚠ STAFF ONLY. `plan`, `inputs` and `parts` carry a distance, a weight and the business's pricing —
 * none of which a customer or a shop may see (FR-032/FR-038). A customer contract carries `lines`
 * alone (`DeliveryFeeDTO`). `*Cents` are integer minor units, as the engine computes them.
 */
export interface DeliveryFeeBreakdownDTO {
  v: 1;
  kind: "effy" | "courier";
  plan: { id: string; name: string };
  inputs: {
    km: number | null;
    grams: WireInt;
    basketCents: WireInt;
    slotId: string | null;
    windowIsToday: boolean;
  };
  parts: {
    baseCents: WireInt;
    distanceCents: WireInt;
    /** The band the distance fell in; null = the open-ended "and beyond" band (or a courier order). */
    distanceBandUpperKm: number | null;
    weightCents: WireInt;
    weightBandUpperGrams: WireInt | null;
    premiumCents: WireInt;
    rawCents: WireInt;
    roundedCents: WireInt;
    /** Which limit moved the rounded fee, if either did. */
    clamp: "floor" | "cap" | null;
    deliveryCents: WireInt;
    freeApplied: boolean;
    smallOrderCents: WireInt;
    totalCents: WireInt;
  };
  lines: DeliveryFeeLineDTO[];
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

/**
 * 073 — who has one package for one stage (collection or delivery), and how it got there.
 *
 * `assignmentId` is the concurrency token the manual actions send back: the current assignment, or
 * null when nobody has it. `movable` is false once the goods are in a van.
 */
export interface OrderAssignment {
  assignmentId: string | null;
  driver: { id: string; name: string } | null;
  /** When the round opens, if it has not yet; null otherwise. */
  opensAt: string | null;
  dueAt: string | null;
  roundId: string | null;
  /** One line: "Auto-assigned — fewest packages today (2)" or "Assigned by Ann". */
  how: string | null;
  /** One line, only when nobody has it: "No driver is on duty". */
  unassignedReason: string | null;
  movable: boolean;
}

