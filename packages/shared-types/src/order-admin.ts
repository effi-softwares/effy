/**
 * Back-office order contracts. A separate family from `order.ts` on purpose: these carry shop identity
 * (an operator must see which shop holds which package), and the customer's contract must never learn
 * it. No shared base interface, no `extends`. Money is a 2-dp decimal string.
 */

import type { OrderPaymentSplitDTO } from "./points";
import type { OrderStage, OrderStatus } from "./order";
// The refund vocabulary is shared with the customer contract; what differs is how much is shown (`RefundDTO` vs `CustomerRefundDTO`).
import type {
  ProposedRefundDTO,
  RefundDTO,
  RefundRequestDTO,
} from "./refund";
import type { WireInt } from "./cart";
import type { HandoverMethod, HandoverStep } from "./driver";
import type { ParcelCustody, ParcelZone } from "./parcels";
import type { DeliveryFeeLineDTO } from "./delivery-fee";
import type { DeliveryInstructionsDTO } from "./delivery-instructions";
import type { DeliveryPromise, DeliveryType, DeliveryTypeReason } from "./delivery-type";
import type { DeliveryWindow } from "./delivery-window";
import type { PackageStatusView } from "./package-status";

/** How an arrival came to be known (`public.package_arrival.source`). */
export type ArrivalSource = "driver_proof" | "staff_recorded" | "carrier_signal";
/** What an order waits on, for the console's work queue. Derived (from the absence of handover and arrival rows), never stored. */
export type OrderAwaiting =
  | "handover"
  | "arrival"
  /** A shop cannot supply its portion and nobody has decided what to do. Ranks first: the customer is out of pocket. */
  | "refund_decision"
  /** A courier parcel is failed, lost, damaged or returned and unresolved: the customer paid for something not coming. */
  | "courier_problem";
export const ORDER_AWAITING: readonly OrderAwaiting[] = ["refund_decision", "courier_problem", "handover", "arrival"];

/** Where a consignment is. */
export type ConsignmentState =
  | "booked" | "handed_over" | "in_transit" | "delivered"
  | "failed" | "lost" | "damaged" | "returned" | "cancelled";

/** One step a person records. `resolved` closes an open problem; `cancelled` drops an unsent booking. */
export type ConsignmentEventKind =
  | "booked" | "handed_over" | "in_transit" | "delivered"
  | "failed" | "lost" | "damaged" | "returned" | "resolved" | "cancelled";

/** The problem steps: each puts the order on the needs-attention list until resolved. */
export const CONSIGNMENT_PROBLEMS = ["failed", "lost", "damaged", "returned"] as const;

/** One parcel's journey with a courier, for staff. */
export interface ConsignmentDTO {
  id: string;
  service: { id: string; label: string };
  collection: "hub" | "supplier";
  reference: string | null;
  trackingUrl: string | null;
  /** A short-lived presigned read; null when no label was attached. */
  labelUrl: string | null;
  pickup: { date: string; from: string | null; to: string | null } | null;
  state: ConsignmentState;
  events: { kind: ConsignmentEventKind; actor: { kind: "staff" | "shop"; sub: string }; note: string | null; at: string }[];
}

/** `PUT /orders/v1/fulfillments/{id}/consignment`: book, or edit a booking. */
export interface ConsignmentInput {
  serviceId: string;
  reference?: string | null;
  trackingUrl?: string | null;
  labelKey?: string | null;
  pickup?: { date: string; from?: string | null; to?: string | null } | null;
}

/** `POST /orders/v1/fulfillments/{id}/consignment/events`. */
export interface ConsignmentEventInput {
  kind: Exclude<ConsignmentEventKind, "booked">;
  note?: string | null;
}

/** `POST /orders/v1/fulfillments/{id}/consignment/label`: where to upload a label file. */
export interface ConsignmentLabelUploadDTO {
  labelKey: string;
  uploadUrl: string;
  /** The content type the upload must be sent with. */
  contentType: string;
}

/** `PUT /orders/v1/orders/{id}/courier-collection`. */
export interface CourierCollectionInput {
  mode: "hub" | "supplier";
  note?: string | null;
}

/** A row in the back-office order list. */
export interface AdminOrderSummaryDTO {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  /** The customer-facing progress word, server-derived. */
  stage: OrderStage;
  placedAt: string | null;
  customerEmail: string;
  itemCount: number;
  packageCount: number;
  grandTotalAmount: string;
  currency: string;
  /** Null when nothing is outstanding (the order is finished). */
  awaiting: OrderAwaiting | null;
  /** Where the order is, in staff words: its least advanced package (a Problem anywhere wins). Null with no packages yet. */
  statusView: PackageStatusView | null;
  /** The drivers collecting and delivering this order's packages, by name, without repeats. */
  drivers: { collect: string[]; deliver: string[] };
  /** Some package is waiting for a driver and nobody has it. */
  needsDriver: boolean;
  /** Who delivers the order. */
  deliveryType: DeliveryType;
  /** What an Effy order was sold; null for a courier order. */
  promise: DeliveryPromise | null;
}

/** The order list's promise filter (Effy orders only). */
export const ADMIN_ORDER_PROMISE_FILTERS = ["window", "day", "asap"] as const satisfies readonly DeliveryPromise[];

/** The order list's delivery filter. */
export const ADMIN_ORDER_DELIVERY_FILTERS = ["effy", "courier"] as const;
export type AdminOrderDeliveryFilter = (typeof ADMIN_ORDER_DELIVERY_FILTERS)[number];

/** One entry in an order's delivery-type history: the checkout's decision, then any change. */
export interface DeliveryTypeChangeDTO {
  /** Null on the first entry. */
  from: DeliveryType | null;
  to: DeliveryType;
  reason: DeliveryTypeReason;
  /** The checkout decided, or a staff member changed it (their auth subject). */
  actor: { kind: "checkout" } | { kind: "staff"; sub: string };
  note: string | null;
  at: string;
}

/** One shop's portion of an order, as an operator sees it. */
/** Every step a hand-over can be recorded at: the driver's five, plus the shop's (pack, hand to a courier, a collection from the shop). */
export type RecordedHandoverStep = HandoverStep | "pack" | "courier_handover" | "shop_pickup";

/** Who made a hand-over: a driver is named; shop and hub staff are said by role. */
export type HandoverActorKind = "driver" | "shop_staff" | "admin_staff";

/** One recorded hand-over of a package. Staff only. */
export interface AdminPackageHandoverDTO {
  step: RecordedHandoverStep;
  method: HandoverMethod;
  at: string;
  /** The driver's name; null when shop or hub staff made it (see `actor`). */
  driverName: string | null;
  /** Optional for an older deploy; absent means a driver. */
  actor?: HandoverActorKind;
  /** The bag it was; absent on a hand-over recorded before bags. */
  parcelCode?: string;
}

/** One bag of a package as back-office sees it, voided ones included (struck through). */
export interface AdminParcelDTO {
  parcelId: string;
  code: string;
  seq: number;
  /** How many live bags the package has now. */
  of: number;
  zone: ParcelZone;
  voided: boolean;
  printedCount: number;
  custody: ParcelCustody;
  /** This bag's hand-overs, oldest first. */
  handovers: AdminPackageHandoverDTO[];
}

export interface AdminOrderPackageDTO {
  /** Where this package really is, derived from the dispatch and carrier records, not from `status` (which stops at `collected`). */
  statusView: PackageStatusView | null;
  /** Who is collecting it; null when it is not a collection matter (yet, or any more). */
  collect: OrderAssignment | null;
  /** Who is delivering it; null before it reaches a delivery round. */
  deliver: OrderAssignment | null;
  fulfillmentId: string;
  /** The package's permanent code, as printed on its label. */
  packageCode: string;
  /** Every recorded hand-over, oldest first; empty when none was recorded (never "by hand" by assumption). */
  handovers?: AdminPackageHandoverDTO[];
  /** The package's bags, each with its own label and hand-overs. Optional for older deploys. */
  parcels?: AdminParcelDTO[];
  /** Present here only, never on a customer-facing contract. */
  shopId: string;
  shopName: string;
  status: string;
  itemCount: number;
  subtotalAmount: string;
  /** Who takes this package to the customer. This, not `deliveryMethod` or `window`, decides whether a carrier handover applies. */
  deliveredBy: DeliveryType;
  /** The parcel's live consignment, when a courier takes it and one is booked or handed over. */
  consignment: ConsignmentDTO | null;
  /** When a courier parcel is due out (the service's next pickup); null for an Effy parcel or one already handed over. */
  dueOut: string | null;
  /** Past `dueOut` (or a booked supplier pickup's window) and not handed over. */
  late: boolean;
  /** "same_day" | "standard" | null: the customer's word (see `deliveredBy`). */
  deliveryMethod: string | null;
  handoff: CarrierHandoffDTO | null;
  arrival: PackageArrivalDTO | null;
  /** The delivery day promised (yyyy-mm-dd), or null. */
  promisedDate: string | null;
  /** The window the customer was sold, or null. */
  window: DeliveryWindow | null;
  /** A late payer took this order's slot over its capacity. Staff only. */
  overCapacity: boolean;
  /** The day a standard package must reach the carrier to arrive on `promisedDate`; null otherwise. */
  handoverDueOn: string | null;
  /** Past `handoverDueOn` with no handover, or handed over after it. Derived on read. */
  atRisk: boolean;
  /** Whether it arrived inside its window (or on its day); null until it arrives, or with no promise. */
  onTime: boolean | null;
}

/** One package on the carrier handover list. */
export interface HandoverRowDTO {
  fulfillmentId: string;
  orderId: string;
  orderNumber: string;
  /** Null for a courier order: the customer was told an estimate, not a day. */
  promisedDate: string | null;
  handoverDueOn: string;
  atRisk: boolean;
  /** Checked in at the hub; until then it cannot be handed over. */
  atHub: boolean;
  /** The courier service it goes with ("Courier · Service"), when known. */
  service: string | null;
  /** That service's next pickup (ISO instant), for a hub parcel. */
  dueOut: string | null;
  collection: "hub" | "supplier";
  consignmentState: ConsignmentState | null;
  /** A booked supplier pickup. */
  pickup: { date: string; from: string | null; to: string | null } | null;
  /** The latest problem step, for the `problems` view. */
  problem: string | null;
}

/**
 * The Courier tab's views: `hub_due` / `hub_late` (at or due at the hub, not handed over), `supplier`
 * (supplier pickups not handed over), `with_courier` (handed over, not delivered; overdue first),
 * `problems` (an open problem).
 */
export type CourierView = "hub_due" | "hub_late" | "supplier" | "with_courier" | "problems";
export const COURIER_VIEWS: readonly CourierView[] = ["hub_due", "hub_late", "supplier", "with_courier", "problems"];

export interface HandoverListResponse {
  items: HandoverRowDTO[];
}

/** A package's handover to an outside carrier. */
export interface CarrierHandoffDTO {
  /** Null is an ordinary state (most handovers have no reference): never render it as missing or withhold the handover. */
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
  /** Null for `driver_proof`, where the driver is attributable through the delivery. */
  recordedBySub: string | null;
  note: string | null;
}

/**
 * One thing that happened to an order: a read-side projection over `fulfillment_event`,
 * `carrier_handoff` and `package_arrival`, never a stored timeline.
 */
export interface AdminOrderHistoryEntryDTO {
  at: string;
  /** Where this entry came from, so the console can group and label it. */
  kind: "fulfillment" | "driver" | "handoff" | "arrival";
  /** A human-readable summary, e.g. "Packed and ready for collection". */
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
  /** Who delivers the order. */
  deliveryType: DeliveryType;
  deliveryTypeReason: DeliveryTypeReason;
  /** The courier timeframe as sold; null unless a courier delivers. */
  courierEstimate: string | null;
  /** What an Effy order was sold; null for a courier order. */
  promise: DeliveryPromise | null;
  /** The estimate an "as soon as possible" customer was told. */
  asapEstimate?: string | null;
  /** Oldest first. */
  deliveryTypeHistory: DeliveryTypeChangeDTO[];
  /** How this courier order's parcels reach the courier; null unless a courier delivers. */
  courierCollection: "hub" | "supplier" | null;
  /** Oldest first. */
  courierCollectionHistory: { from: "hub" | "supplier"; to: "hub" | "supplier"; actorSub: string; note: string | null; at: string }[];
  /** Every back-office move of the delivery type, with its compensation; oldest first. */
  deliveryMoves: AdminDeliveryMoveDTO[];

  customerId: string;
  customerEmail: string;
  customerName: string | null;
  /** How the order was paid when points were part of it, and what has come back of each. Absent with no points. */
  paymentSplit?: OrderPaymentSplitDTO;

  items: AdminOrderItemDTO[];
  packages: AdminOrderPackageDTO[];
  history: AdminOrderHistoryEntryDTO[];

  itemSubtotalAmount: string;
  deliveryFeeAmount: string;
  /** How `deliveryFeeAmount` was built, exactly as stored at placement. */
  deliveryFeeBreakdown: DeliveryFeeBreakdownDTO;
  discountAmount: string;
  promoCode: string | null;
  /** Each promotion applied, as sold; staff also see its internal name. */
  promotions?: { name: string; headline: string; code: string | null; goodsAmount: string; deliveryAmount: string }[];
  /** What delivery promotions took off the fee. */
  deliveryDiscountAmount?: string;
  grandTotalAmount: string;
  currency: string;

  paymentStatus: string;
  paymentMethod: AdminPaymentMethodDTO | null;

  /** The delivery destination, as snapshotted onto the order at checkout. */
  deliveryAddress: Record<string, unknown>;
  /** Null means "same as delivery"; the console says so. */
  billingAddress: Record<string, unknown> | null;
  /** The customer's instructions to the driver, as given; null when none. Free text: render as a text node. */
  deliveryInstructions?: DeliveryInstructionsDTO | null;

  /** True when every package has arrived (a rollup, never a max). */
  finished: boolean;
  awaiting: OrderAwaiting | null;

  /**
   * The refund picture for staff: all five states and their `failureReason` (the customer's view
   * collapses to three with no reason), since the distinction decides whether retrying helps.
   */
  refunds: RefundDTO[];
  /** The sum of every refund not in a terminal failure. */
  refundedAmount: string;
  /** What could still be refunded, computed by the server. Advisory: the issue recomputes it under the row lock. */
  refundableAmount: string;
  /** Per-line remaining units, so the console never offers a refunded unit. */
  refundableLines: RefundableLineDTO[];
  /** Refunds the platform believes are owed but nobody has issued: derived on every read; only a dismissal is stored. */
  proposedRefunds: ProposedRefundDTO[];
  /** An open customer request, if there is one. */
  refundRequest: RefundRequestDTO | null;
}

/**
 * The whole of a placed order's delivery charge: which plan priced it, from what, and every step,
 * written once at the intent. Staff only: `plan`, `inputs` and `parts` carry distance, weight and
 * pricing; a customer contract carries `lines` alone. `*Cents` are integer minor units.
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
    /** The band the distance fell in; null = the open-ended band (or a courier order). */
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
  variantLabel: string | null;
  unitPriceAmount: string;
  /** Remaining units: ordered minus already refunded. */
  quantity: WireInt;
}

/** A line on the order, for the operator. */
export interface AdminOrderItemDTO {
  orderItemId: string;
  productId: string;
  variantId: string;
  productName: string;
  /** The variant's label as sold; null for a product with no options. */
  variantLabel: string | null;
  /** Effy's code for the variant as sold (V + 6). */
  variantCode: string | null;
  /** The shop's own stock code as sold. */
  sku: string | null;
  unitPriceAmount: string;
  quantity: number;
  lineSubtotalAmount: string;
  /** Operator only, like `AdminOrderPackageDTO.shopId`. */
  shopId: string;
}

/** How an order was paid. No card data beyond `last4`, ever. */
export interface AdminPaymentMethodDTO {
  type: string;
  brand: string | null;
  last4: string | null;
}

/** `POST /orders/v1/fulfillments/{id}/handoff`. */
export interface RecordHandoffRequest {
  reference?: string;
  carrierName?: string;
  note?: string;
  /** A per-action idempotency key from the client. */
  changeId: string;
}

/** `POST /orders/v1/fulfillments/{id}/arrival`. */
export interface RecordArrivalRequest {
  /** ISO 8601; omitted means now. */
  arrivedAt?: string;
  note?: string;
  changeId: string;
}

/** The list response. */
/** GET /orders/v1/summary/today: orders placed since Melbourne midnight, by who delivers them, and today's refunds. */
export interface AdminOrdersTodayDTO {
  /** The Melbourne date the figures are for, `YYYY-MM-DD`. */
  date: string;
  effy: WireInt;
  courier: WireInt;
  refunded: { orders: WireInt; amount: string; currency: string };
}

/** GET /orders/v1/summary/views: how many orders each saved view holds, under the list's `q`, `deliveryType`, `open` and `promise` filters. */
export interface AdminOrderViewCountsDTO {
  all: WireInt;
  needsDriver: WireInt;
  handover: WireInt;
  arrival: WireInt;
  refundDecision: WireInt;
  courierProblem: WireInt;
}

export interface AdminOrderListResponse {
  items: AdminOrderSummaryDTO[];
  nextCursor: string | null;
}

/**
 * Who has one package for one stage (collection or delivery), and how. `assignmentId` is the
 * concurrency token the manual actions send back (null when nobody has it); `movable` is false once the
 * goods are in a van.
 */
export interface OrderAssignment {
  assignmentId: string | null;
  driver: { id: string; name: string } | null;
  /** When the round opens, if it has not yet; null otherwise. */
  opensAt: string | null;
  dueAt: string | null;
  roundId: string | null;
  /** One line: "Auto-assigned: fewest packages today (2)" or "Assigned by Ann". */
  how: string | null;
  /** One line, only when nobody has it: "No driver is on duty". */
  unassignedReason: string | null;
  movable: boolean;
}

// Moving an order between Effy and courier delivery, and compensating the customer

/**
 * How a customer is made whole for a move to courier. Staff choose one; nothing is chosen for them.
 *  points_difference points worth what they paid for Effy delivery less the courier fee (the default)
 *  free_delivery_points points worth the whole delivery charge they paid
 *  free_delivery_refund the whole delivery charge back to the card
 *  refund_difference the difference back to the card — the last resort
 *  none nothing, with a note saying why (always, on a move back to Effy)
 */
export const DELIVERY_COMPENSATION_KINDS = [
  "points_difference", "free_delivery_points", "free_delivery_refund", "refund_difference", "none",
] as const;
export type DeliveryCompensationKind = (typeof DELIVERY_COMPENSATION_KINDS)[number];

/** Why a move is refused, each said to staff in one line (back-office `errorText.ts`). */
export type DeliveryMoveRefusal =
  | "not_found" | "not_paid" | "already_courier" | "already_effy"
  | "handed_over" | "delivered" | "out_for_delivery" | "with_driver_after_failure" | "courier_not_ready"
  | "not_in_area" | "window_unavailable" | "changed" | "compensation_changed";

/** One move by back-office, as the order page lists it. */
export interface AdminDeliveryMoveDTO {
  id: string;
  at: string;
  to: DeliveryType;
  /** What staff wrote. Staff only, never on a customer or shop contract. */
  reason: string;
  actor: { sub: string; name: string };
  /** The window released (to courier) or taken (back to Effy); null when none. */
  window: { date: string; start: string; end: string } | null;
  courier: { courierName: string; serviceName: string; collection: "hub" | "supplier" } | null;
  paidDeliveryAmount: string;
  courierFeeAmount: string | null;
  differenceAmount: string | null;
  compensation: DeliveryCompensationKind;
  /** What was given ("0.00" for none). */
  amount: string;
  points: number | null;
  /** The refund's state when the compensation went to the card (submitting, submitted, succeeded, failed, refused). */
  refundStatus: string | null;
  compensationNote: string | null;
}

/** One way to make it right, as the preview prices it. */
export interface DeliveryMoveChoiceDTO {
  kind: DeliveryCompensationKind;
  amount: string;
  points?: number;
  /** Card refunds: the part to the card, and the points returned (an order paid partly in points). */
  cardAmount?: string;
  pointsReturned?: number;
  default?: true;
  lastResort?: true;
  noteRequired?: true;
}

/** A window the order could be sold now, for a move back to Effy. */
export interface DeliveryMoveWindowDTO {
  slotId: string;
  date: string;
  start: string;
  end: string;
  label: string;
  /** The day's Any time window: the order is then promised the day, not these hours. */
  anyTime?: true;
}

/** `GET /orders/v1/orders/{orderId}/delivery-move?to=`. */
export interface DeliveryMovePreviewDTO {
  to: DeliveryType;
  allowed: boolean;
  refusal: { code: DeliveryMoveRefusal; message: string } | null;
  /** Echo it back as `expectedUpdatedAt`. */
  updatedAt: string;
  paidDeliveryAmount: string;
  courierFeeAmount: string | null;
  differenceAmount: string | null;
  refundableAmount: string;
  centsPerPoint: number;
  /** To courier: every choice, the default first. Empty back to Effy. */
  choices: DeliveryMoveChoiceDTO[];
  courier: { courierName: string; serviceName: string; estimate: string; collection: "hub" | "supplier" } | null;
  /** Back to Effy: the windows open now with room. Null to courier. */
  windows: DeliveryMoveWindowDTO[] | null;
}

/** `POST /orders/v1/orders/{orderId}/delivery-move`. */
export type DeliveryMoveRequest =
  | {
      to: "courier";
      reason: string;
      compensation: DeliveryCompensationKind;
      compensationNote?: string | null;
      expectedUpdatedAt: string;
      /** The chosen compensation's amount as previewed; a different recomputation is refused. */
      expectedAmount: string;
    }
  | { to: "effy"; reason: string; window: { slotId: string; date: string }; expectedUpdatedAt: string };

export interface DeliveryMoveResponse {
  move: AdminDeliveryMoveDTO;
  /** When the compensation went to the card: where the refund stands. `stalled` = the provider did not answer. */
  refund?: { status: string; stalled?: true };
}
