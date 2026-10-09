// Back-office order use-cases (053 US1). Maps rows to DTOs; no SQL here, no HTTP here.

import type {
  AdminOrderDetailDTO,
  AdminOrderHistoryEntryDTO,
  AdminOrderItemDTO,
  AdminOrderPackageDTO,
  AdminOrderSummaryDTO,
  AdminPaymentMethodDTO,
  ArrivalSource,
  ConsignmentDTO,
  ConsignmentState,
  CourierView,
  HandoverDueFilter,
  HandoverRowDTO,
  OrderAwaiting,
  OrderStage,
  OrderStatus,
  RefundDTO,
  RefundRequestDTO,
} from "@effy/shared-types";

import { COUNTED_REFUND_STATUSES, imageUrlOrNull, operatingStamp, packageStatuses, query, stageFor, type Queryable } from "@effy/edge-shared";
import { CONSIGNMENT_PROBLEMS, leastAdvanced, type OrderAssignment, type PackageStatusView } from "@effy/shared-types";

import { judgePromise } from "./promise";
import { consignmentsFor, nextCourierPickup, parseClock } from "@effy/edge-shared/delivery";
import * as refundRepo from "./refunds";
import { assignmentsFor } from "./assignments";
import * as repo from "./repository";

/** Page size. Capped so a mistyped `limit` cannot ask for the whole table. */
export const MAX_LIMIT = 100;
export const DEFAULT_LIMIT = 25;

// ⚠ The customer-facing progress word and the refund ceiling's status set are NOT defined here.
// They are the shared library's (`order-completion.ts`): the same function the shopper's own order
// page calls, so the console cannot show staff a different word from the one the shopper sees.
export { COUNTED_REFUND_STATUSES, stageFor };

/**
 * What the order is waiting on — the console's work queue.
 *
 * ⚠ ORDERED BY WHOSE MONEY IS AT STAKE, not by lifecycle position. 055 puts `refund_decision` FIRST:
 * a package awaiting handover or arrival is late, but a package a shop cannot supply is money the
 * platform is holding for goods that will never be sent. An order can genuinely be waiting on more
 * than one thing, and this says which one an operator should act on.
 */
function awaitingFor(handover: number, arrival: number, unfulfillable = 0, courierProblems = 0): OrderAwaiting | null {
  if (unfulfillable > 0) return "refund_decision";
  // 080 — a parcel the courier lost, damaged, returned or could not deliver: the customer is waiting
  // on someone at Effy to act, before anything that is merely late.
  if (courierProblems > 0) return "courier_problem";
  if (handover > 0) return "handover";
  if (arrival > 0) return "arrival";
  return null;
}

/**
 * 073 — where each package is, read through the ONE shared derivation. ⚠ Through `query`, so the
 * container tests' database is the one asked.
 */
const db: Queryable = { query: (text, values) => query(text, values) };

type Assignments = Awaited<ReturnType<typeof assignmentsFor>>;

export function toSummary(
  row: repo.OrderSummaryRow,
  statuses: ReadonlyMap<string, PackageStatusView> = new Map(),
  assignments: Assignments = new Map(),
): AdminOrderSummaryDTO {
  const ids = row.package_ids ?? [];
  const views = ids.flatMap((id) => {
    const v = statuses.get(id);
    return v ? [v] : [];
  });
  const names = (pick: "collect" | "deliver") => [
    ...new Set(ids.flatMap((id) => {
      const n = assignments.get(id)?.[pick]?.driver?.name;
      return n ? [n] : [];
    })),
  ];
  return {
    drivers: { collect: names("collect"), deliver: names("deliver") },
    needsDriver: ids.some((id) => {
      const a = assignments.get(id);
      return a?.collect?.assignmentId === null || a?.deliver?.assignmentId === null;
    }),
    deliveryType: row.delivery_type ?? null,
    // 073 — the least advanced package's status, in the words every staff screen uses.
    statusView: leastAdvanced(views),
    id: row.id,
    orderNumber: row.order_number,
    status: row.status as OrderStatus,
    stage: stageFor(row.statuses),
    placedAt: row.placed_at ? row.placed_at.toISOString() : null,
    customerEmail: row.customer_email,
    itemCount: row.item_count,
    packageCount: row.package_count,
    grandTotalAmount: row.grand_total_amount,
    currency: row.currency,
    awaiting: awaitingFor(row.awaiting_handover, row.awaiting_arrival, 0, row.courier_problems ?? 0),
  };
}

export async function listOrders(params: repo.ListParams): Promise<{
  items: AdminOrderSummaryDTO[];
  nextCursor: string | null;
}> {
  // Ask for one more than the page so "is there another page?" needs no second query.
  const rows = await repo.list({ ...params, limit: params.limit + 1 });
  const page = rows.slice(0, params.limit);
  // ⚠ The cursor is `created_at` — the SAME column the query orders and filters on. Minting it from
  // `placed_at` (an earlier draft did) makes page 2 repeat rows from page 1, because `placed_at` is
  // always the later instant. See the note on `OrderSummaryRow.created_at`.
  const nextCursor =
    rows.length > params.limit && page.length > 0
      ? page[page.length - 1]!.created_at.toISOString()
      : null;
  const ids = page.flatMap((r) => r.package_ids ?? []);
  const [statuses, assignments] = await Promise.all([packageStatuses(db, ids), assignmentsFor(ids)]);
  return { items: page.map((r) => toSummary(r, statuses, assignments)), nextCursor };
}

/** 080 — a consignment for staff. The label is a short-lived presigned read; never public. */
export async function toConsignment(c: import("@effy/edge-shared/delivery").ConsignmentRow): Promise<ConsignmentDTO> {
  return {
    id: c.id,
    service: { id: c.service_id, label: `${c.courier_name} · ${c.service_name}` },
    collection: c.collection,
    reference: c.reference,
    trackingUrl: c.tracking_url,
    labelUrl: await imageUrlOrNull(c.label_key),
    pickup: c.pickup_date ? { date: c.pickup_date, from: c.pickup_from, to: c.pickup_to } : null,
    state: c.state,
    events: c.events.map((e) => ({ kind: e.kind, actor: { kind: e.actor_kind, sub: e.actor_sub }, note: e.note, at: new Date(e.at).toISOString() })),
  };
}

/** Exported so the promise fields can be proven against the real schema without the whole order read. */
export function toPackage(
  row: repo.PackageRow,
  statusView: PackageStatusView | null = null,
  assignment: { collect: OrderAssignment | null; deliver: OrderAssignment | null } = { collect: null, deliver: null },
  consignment: ConsignmentDTO | null = null,
  now: Date = new Date(),
): AdminOrderPackageDTO {
  // 080 — a hub courier parcel is due out by its service's next pickup.
  const dueOut = row.courier_collection === "hub" && !row.handoff_at ? courierDueOut(row, now) : null;
  // 069 — what it was promised and whether that is being kept. Derived, never stored.
  const verdict = judgePromise({
    courierDueOut: row.courier_collection === "hub" ? courierDueOut(row, now) : null,
    handoffAt: row.handoff_at,
    now,
    deliveredBy: row.delivered_by,
    courierOrder: row.courier_order,
    placedDate: row.placed_date,
    promisedDate: row.promised_date,
    windowEnd: row.window_end,
    today: row.today,
    handoffDate: row.handoff_date,
    arrivedAt: row.arrival_at,
    arrivalDate: row.arrival_date,
    carrierLeadDays: row.carrier_lead_days,
  });
  // A booked supplier pickup whose day has gone with no handover is late too.
  const pickupLate = row.courier_collection === "supplier" && !row.handoff_at && consignment?.pickup !== undefined && consignment?.pickup !== null
    && consignment.pickup.date < row.today;
  return {
    // 073 — where it really is. ⚠ Not derived from `status` below: that is the SHOP's status, which
    // stops at `collected` by design. Null only where the read was not asked for it.
    statusView,
    collect: assignment.collect,
    deliver: assignment.deliver,
    promisedDate: row.promised_date,
    window:
      row.window_start && row.window_end
        ? { startAt: row.window_start.toISOString(), endAt: row.window_end.toISOString() }
        : null,
    overCapacity: row.over_capacity,
    handoverDueOn: verdict.handoverDueOn,
    atRisk: verdict.atRisk,
    onTime: verdict.onTime,
    fulfillmentId: row.fulfillment_id,
    shopId: row.shop_id,
    shopName: row.shop_name,
    status: row.status,
    itemCount: row.item_count,
    subtotalAmount: row.subtotal_amount,
    deliveredBy: row.delivered_by,
    consignment,
    dueOut: dueOut ? operatingStamp(dueOut) : null,
    late: verdict.atRisk || pickupLate,
    deliveryMethod: row.method,
    handoff: row.handoff_at
      ? {
          // ⚠ NULL stays NULL and is a COMPLETE state (FR-003). Do not substitute a placeholder, a
          // dash, or an empty string here — the console must be able to tell "no reference" from
          // "reference is the empty string", and must render the first as ordinary.
          reference: row.handoff_reference,
          carrierName: row.handoff_carrier,
          handedOverAt: row.handoff_at.toISOString(),
          recordedBySub: row.handoff_by!,
          note: row.handoff_note,
        }
      : null,
    arrival: row.arrival_at
      ? {
          arrivedAt: row.arrival_at.toISOString(),
          source: row.arrival_source as ArrivalSource,
          recordedBySub: row.arrival_by,
          note: row.arrival_note,
        }
      : null,
  };
}

function toItem(row: repo.OrderItemRow): AdminOrderItemDTO {
  return {
    orderItemId: row.order_item_id,
    productId: row.product_id,
    productName: row.product_name,
    unitPriceAmount: row.unit_price_amount,
    quantity: row.quantity,
    lineSubtotalAmount: row.line_subtotal_amount,
    shopId: row.shop_id,
  };
}

function toHistory(row: repo.HistoryRow): AdminOrderHistoryEntryDTO {
  return {
    at: row.at.toISOString(),
    kind: row.kind as AdminOrderHistoryEntryDTO["kind"],
    summary: row.summary,
    actorSub: row.actor_sub,
    fulfillmentId: row.fulfillment_id,
  };
}

function toPaymentMethod(row: repo.OrderDetailRow): AdminPaymentMethodDTO | null {
  // Absent on a pre-052 order, or where the post-commit capture failed. "Not captured" is data, not
  // a gap — the console omits the line rather than inventing one.
  if (!row.method_type) return null;
  return { type: row.method_type, brand: row.method_brand, last4: row.method_last4 };
}

export async function getOrder(orderId: string): Promise<AdminOrderDetailDTO | null> {
  const order = await repo.findOrder(orderId);
  if (!order) return null;

  // ⚠ PARALLEL, not four serial round trips. A Sydney RDS hop measures ~135 ms and this detail reads
  // from six tables — 029 found the storefront home intermittently 503-ing at 3.007 s from exactly
  // this mistake (8 serial queries), and that was on the customer's critical path.
  const [itemRows, packageRows, historyRows, typeRows, refundRows, refundLineRows, proposedRows, requestRow] =
    await Promise.all([
      repo.items(orderId),
      repo.packages(orderId),
      repo.history(orderId),
      // 079 — one more read in the same wave; nothing for an order placed before 079.
      order.delivery_type ? repo.deliveryTypeHistory(orderId) : Promise.resolve([]),
      refundRepo.refunds(orderId),
      refundRepo.refundLines(orderId),
      refundRepo.proposedRefunds(orderId),
      refundRepo.refundRequest(orderId),
    ]);
  // ⚠ A SECOND HOP, and deliberately not folded into the wave above: the items belong to a request
  // that may not exist, and asking for them unconditionally would query on a foreign key we have not
  // read yet. It costs one round trip on the rare order that HAS an open request, and none otherwise.
  const requestItemRows = requestRow ? await refundRepo.refundRequestItems(requestRow.request_id) : [];

  const pkgIds = packageRows.map((p) => p.fulfillment_id);
  const [statusById, assignmentById, consignmentById, collectionHistory] = await Promise.all([
    packageStatuses(db, pkgIds),
    assignmentsFor(pkgIds),
    // 080 — each courier parcel's live consignment, and the order's collection-mode history.
    order.delivery_type === "courier" ? consignmentsFor(db, pkgIds) : Promise.resolve(new Map()),
    order.delivery_type === "courier" ? repo.courierCollectionHistory(orderId) : Promise.resolve([]),
  ]);
  const consignments = new Map(
    await Promise.all([...consignmentById].map(async ([id, c]) => [id, await toConsignment(c)] as const)),
  );
  const packages = packageRows.map((p) =>
    toPackage(p, statusById.get(p.fulfillment_id) ?? null, assignmentById.get(p.fulfillment_id), consignments.get(p.fulfillment_id) ?? null),
  );
  const statuses = packageRows.map((p) => p.status);
  const awaitingHandover = packageRows.filter(
    // ⚠ 079 — the same definition the list's badge and filter use. Until then this one line had
    // missed 078's rule and counted an Effy later-day package as awaiting a carrier.
    (p) => p.status === "collected" && p.delivered_by === "courier" && !p.handoff_at,
  ).length;
  const awaitingArrival = packageRows.filter((p) => !p.arrival_at).length;
  // ⚠ 055 US6 — a portion the shop cannot supply, with no refund yet covering it. `refundedCents > 0`
  // is deliberately NOT the test: a partial refund for something else does not answer this.
  const awaitingRefundDecision = packageRows.filter(
    (p) => p.status === "unfulfillable",
  ).length;
  // 080 — the same states the list's badge counts (`OPEN_COURIER_PROBLEM`).
  const courierProblems = [...consignments.values()].filter(
    (c) => c !== null && (CONSIGNMENT_PROBLEMS as readonly string[]).includes(c.state),
  ).length;

  return {
    id: order.id,
    orderNumber: order.order_number,
    status: order.status as OrderStatus,
    stage: stageFor(statuses),
    placedAt: order.placed_at ? order.placed_at.toISOString() : null,
    createdAt: order.created_at.toISOString(),
    // 079 — who delivers it, why, and every change since. All empty for an order placed before 079.
    deliveryType: order.delivery_type,
    deliveryTypeReason: order.delivery_type_reason,
    courierEstimate: order.courier_estimate,
    courierCollection: order.courier_collection ?? null,
    courierCollectionHistory: collectionHistory.map((h) => ({
      from: h.from_mode, to: h.to_mode, actorSub: h.actor_sub, note: h.note, at: h.created_at.toISOString(),
    })),
    deliveryTypeHistory: typeRows.map((r) => ({
      from: r.from_type,
      to: r.to_type,
      reason: r.reason,
      actor: r.actor_kind === "staff" && r.actor_sub ? { kind: "staff" as const, sub: r.actor_sub } : { kind: "checkout" as const },
      note: r.note,
      at: r.created_at.toISOString(),
    })),

    customerId: order.customer_id,
    customerEmail: order.customer_email,
    customerName: order.customer_name,

    items: itemRows.map(toItem),
    packages,
    history: historyRows.map(toHistory),

    itemSubtotalAmount: order.item_subtotal_amount,
    deliveryFeeAmount: order.delivery_fee_amount,
    // 077 — "How this fee was built" (FR-037). ⚠ The staff gateway only; absent before 077.
    ...(order.delivery_fee_breakdown ? { deliveryFeeBreakdown: order.delivery_fee_breakdown } : {}),
    discountAmount: order.discount_amount,
    promoCode: order.promo_code,
    grandTotalAmount: order.grand_total_amount,
    currency: order.currency,

    paymentStatus: order.payment_status ?? "unknown",
    paymentMethod: toPaymentMethod(order),

    deliveryAddress: order.delivery_address,
    billingAddress: order.billing_address,
    // 066 — what the customer told the driver, so staff can answer "I said leave it at the door"
    // without asking them to repeat it. Null when they said nothing; never a default sentence.
    deliveryInstructions:
      order.delivery_handover === null && order.delivery_note === null
        ? null
        : { handover: order.delivery_handover, note: order.delivery_note },

    // FR-007 — a rollup: finished only when EVERY package has arrived.
    finished: packageRows.length > 0 && awaitingArrival === 0,
    awaiting: awaitingFor(awaitingHandover, awaitingArrival, awaitingRefundDecision, courierProblems),

    ...refundView(order.grand_total_amount, itemRows, refundRows, refundLineRows),
    ...paymentSplitView(order, refundRows),
    proposedRefunds: proposedRows.map((p) => ({
      orderItemId: p.order_item_id,
      productName: p.product_name,
      quantity: p.quantity,
      amount: p.amount,
      // Every proposal has one cause: the shop could not supply what was paid for.
      reason: "item_not_supplied" as const,
    })),
    refundRequest: requestRow ? toRefundRequest(requestRow, requestItemRows) : null,
  };
}

/**
 * The refund picture, assembled from rows.
 *
 * ⚠ MONEY IS SUMMED IN INTEGER CENTS AND FORMATTED ONCE. Accumulating 2-dp strings as floats is how
 * `0.1 + 0.2` reaches a screen as `0.30000000000000004`, and on a refund screen a rounding artefact
 * is not cosmetic — it is the number an operator is about to hand back.
 */
/**
 * 074 — how the order was paid when points were part of it, and what has come back of each. Absent
 * on an order that used no points. The refundable figure above stays the order's TOTAL value: a refund
 * is split between card and points by the shared refund service, never by this console.
 */
function paymentSplitView(
  order: repo.OrderDetailRow,
  refundRows: readonly refundRepo.RefundRow[],
): Pick<AdminOrderDetailDTO, "paymentSplit"> {
  if (!order.points_used) return {};
  let cardReturned = 0;
  let pointsReturned = 0;
  for (const r of refundRows) {
    if (!COUNTED_REFUND_STATUSES.includes(r.status)) continue;
    cardReturned += cents(r.card_amount ?? r.amount);
    pointsReturned += r.points_returned ?? 0;
  }
  return {
    paymentSplit: {
      pointsUsed: order.points_used,
      pointsAmount: order.points_value_amount ?? "0.00",
      cardAmount: order.card_paid_amount ?? "0.00",
      pointsReturned,
      cardReturned: money(cardReturned),
    },
  };
}

function refundView(
  grandTotal: string,
  itemRows: readonly repo.OrderItemRow[],
  refundRows: readonly refundRepo.RefundRow[],
  lineRows: readonly refundRepo.RefundLineRow[],
): Pick<
  AdminOrderDetailDTO,
  "refunds" | "refundedAmount" | "refundableAmount" | "refundableLines"
> {
  const counted = refundRows.filter((r) => COUNTED_REFUND_STATUSES.includes(r.status));
  const refundedCents = counted.reduce((sum, r) => sum + cents(r.amount), 0);
  const remainingCents = Math.max(0, cents(grandTotal) - refundedCents);

  // Units already spoken for, per line — by the SAME status set as the money, or the two halves of
  // the ceiling would disagree with each other.
  const countedIds = new Set(counted.map((r) => r.refund_id));
  const usedUnits = new Map<string, number>();
  for (const l of lineRows) {
    if (!countedIds.has(l.refund_id)) continue;
    usedUnits.set(l.order_item_id, (usedUnits.get(l.order_item_id) ?? 0) + l.quantity);
  }

  const linesByRefund = new Map<string, refundRepo.RefundLineRow[]>();
  for (const l of lineRows) {
    const list = linesByRefund.get(l.refund_id) ?? [];
    list.push(l);
    linesByRefund.set(l.refund_id, list);
  }

  return {
    refunds: refundRows.map((r) => ({
      id: r.refund_id,
      kind: r.kind as RefundDTO["kind"],
      amount: r.amount,
      reason: r.reason as RefundDTO["reason"],
      status: r.status as RefundDTO["status"],
      failureReason: r.failure_reason,
      note: r.note,
      // ⚠ 057 — the pool is carried, not only the name. `actor_label` resolves against whichever
      // staff table matches `actor_kind`, and a `system` refund has no person at all; without the
      // kind the console cannot tell "nobody did this" from "we could not resolve who did".
      actorKind: r.actor_kind as RefundDTO["actorKind"],
      actorLabel: r.actor_label,
      createdAt: r.created_at.toISOString(),
      settledAt: r.settled_at ? r.settled_at.toISOString() : null,
      // 074 — present only when points were part of it, so a card-only refund reads as before.
      ...(r.points_returned ? { cardAmount: r.card_amount ?? r.amount, pointsReturned: r.points_returned } : {}),
      lines: (linesByRefund.get(r.refund_id) ?? []).map((l) => ({
        orderItemId: l.order_item_id,
        productName: l.product_name,
        quantity: l.quantity,
        amount: l.amount,
      })),
    })),
    refundedAmount: money(refundedCents),
    refundableAmount: money(remainingCents),
    refundableLines: itemRows
      .map((i) => ({
        orderItemId: i.order_item_id,
        productName: i.product_name,
        unitPriceAmount: i.unit_price_amount,
        quantity: i.quantity - (usedUnits.get(i.order_item_id) ?? 0),
      }))
      // ⚠ A fully refunded line is OMITTED, not shown at zero. A row offering nothing is a control
      // that refuses when used, and the server would refuse it too (FR-008).
      .filter((l) => l.quantity > 0),
  };
}

/** 2-dp decimal string → integer cents. `round`, because `12.34 * 100` is `1233.9999…`. */
function cents(amount: string): number {
  return Math.round(Number(amount) * 100);
}

function money(c: number): string {
  return (c / 100).toFixed(2);
}

function toRefundRequest(
  r: refundRepo.RefundRequestRow,
  items: readonly refundRepo.RefundRequestItemRow[],
): RefundRequestDTO {
  return {
    id: r.request_id,
    message: r.message,
    status: r.status as RefundRequestDTO["status"],
    outcomeNote: r.outcome_note,
    items: items.map((i) => ({
      orderItemId: i.order_item_id,
      productName: i.product_name,
      quantity: i.quantity,
    })),
    createdAt: r.created_at.toISOString(),
    decidedAt: r.decided_at ? r.decided_at.toISOString() : null,
  };
}

// ── 069: the carrier handover list ───────────────────────────────────────────────────────────────

/**
 * 080 — when a courier parcel is due out: its service's next pickup after it reached the hub (or
 * from now, if it has not yet), or null when there is no service to ask (an order from before 080).
 */
export function courierDueOut(
  r: { courier_order: boolean; checked_in_at: Date | null; service_weekdays: number[] | null; service_cutoff: string | null },
  now: Date,
): Date | null {
  if (!r.courier_order || !r.service_weekdays || r.service_weekdays.length === 0 || !r.service_cutoff) return null;
  return nextCourierPickup(r.checked_in_at ?? now, r.service_weekdays, parseClock(r.service_cutoff));
}

const BUSINESS_DAY_MS = 24 * 3600_000;
/** Handed over longer ago than the service's maximum, counting weekdays only. */
function overdueWithCourier(handedAt: Date, maxBusinessDays: number, now: Date): boolean {
  let days = 0;
  for (let t = handedAt.getTime() + BUSINESS_DAY_MS; t <= now.getTime(); t += BUSINESS_DAY_MS) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) days += 1;
  }
  return days > maxBusinessDays;
}

const melbourneDay = (at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(at);

function toCourierRow(r: repo.CourierParcelRow, now: Date): HandoverRowDTO & { _view: CourierView | null; _sort: number } {
  const dueOut = r.courier_collection === "hub" ? courierDueOut(r, now) : null;
  const dueOn = dueOut ? melbourneDay(dueOut) : r.legacy_due_on ?? (r.placed_at ? melbourneDay(r.placed_at) : r.today);
  const handed = r.handed_over_at !== null;
  const problem = r.consignment_state && (CONSIGNMENT_PROBLEMS as readonly string[]).includes(r.consignment_state) ? r.consignment_state : null;

  // A booked supplier pickup whose window (or day) has gone with no handover.
  const pickupLate = r.courier_collection === "supplier" && !handed && r.pickup_date !== null
    && (r.pickup_date < r.today || (r.pickup_date === r.today && r.pickup_to !== null && new Intl.DateTimeFormat("en-GB", {
      timeZone: "Australia/Melbourne", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).format(now) > r.pickup_to));
  const hubLate = r.courier_collection === "hub" && !handed && (dueOut ? now.getTime() > dueOut.getTime() : r.today > dueOn);
  const overdue = handed && !problem && r.max_business_days !== null && overdueWithCourier(r.handed_over_at!, r.max_business_days, now);

  const view: CourierView | null =
    problem ? "problems"
    : handed ? "with_courier"
    : r.courier_collection === "supplier" ? "supplier"
    : hubLate ? "hub_late"
    : "hub_due";
  return {
    fulfillmentId: r.fulfillment_id,
    orderId: r.order_id,
    orderNumber: r.order_number,
    promisedDate: r.promised_date,
    handoverDueOn: dueOn,
    atRisk: hubLate || pickupLate || overdue,
    atHub: r.at_hub,
    service: r.service_label,
    dueOut: dueOut ? operatingStamp(dueOut) : null,
    collection: r.courier_collection,
    consignmentState: (r.consignment_state as ConsignmentState | null) ?? null,
    pickup: r.pickup_date ? { date: r.pickup_date, from: r.pickup_from, to: r.pickup_to } : null,
    problem,
    _view: view,
    _sort: dueOut?.getTime() ?? Date.parse(`${dueOn}T00:00:00Z`),
  };
}

const strip = ({ _view, _sort, ...row }: ReturnType<typeof toCourierRow>): HandoverRowDTO => row;

/**
 * 069 US7, kept: courier parcels at (or due at) the hub, by the day they must leave it. Since 080 that
 * day is the courier service's next pickup for a courier order, 069's promised day less the carrier
 * lead time for an older carrier package. ⚠ Supplier pickups never appear: they do not pass the hub.
 */
export async function listHandovers(due: HandoverDueFilter, now: Date = new Date()): Promise<HandoverRowDTO[]> {
  const rows = (await repo.courierParcels()).map((r) => toCourierRow(r, now))
    .filter((r) => r.collection === "hub" && r._view !== "with_courier" && r._view !== "problems")
    .filter((r) => {
      const today = melbourneDay(now);
      return due === "today" ? r.handoverDueOn === today : due === "overdue" ? r.handoverDueOn < today : r.handoverDueOn > today;
    });
  return rows.sort((a, b) => a._sort - b._sort || a.orderNumber.localeCompare(b.orderNumber)).slice(0, 200).map(strip);
}

/** 080 — the Courier tab: one view of the parcels a courier takes that are not finished. */
/**
 * 080 US5 — how many courier parcels are late, by where they are: at the HUB past their service's
 * next pickup, at a SUPPLIER past a booked pickup, or WITH THE COURIER longer than the service's
 * usual maximum. The same rules the Courier tab shows (one classification, `toCourierRow`).
 */
export async function courierLateCounts(now: Date = new Date()): Promise<{ hub: number; supplier: number; courier: number }> {
  const out = { hub: 0, supplier: 0, courier: 0 };
  for (const r of (await repo.courierParcels()).map((p) => toCourierRow(p, now))) {
    if (!r.atRisk) continue;
    if (r._view === "hub_late") out.hub += 1;
    else if (r._view === "supplier") out.supplier += 1;
    else if (r._view === "with_courier") out.courier += 1;
  }
  return out;
}

export async function listCourierParcels(view: CourierView, now: Date = new Date()): Promise<HandoverRowDTO[]> {
  const rows = (await repo.courierParcels()).map((r) => toCourierRow(r, now)).filter((r) => r._view === view);
  // Late first, then soonest due.
  return rows.sort((a, b) => Number(b.atRisk) - Number(a.atRisk) || a._sort - b._sort || a.orderNumber.localeCompare(b.orderNumber)).slice(0, 200).map(strip);
}
