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
  HandoverRowDTO,
  OrderAwaiting,
  OrderStatus,
  RefundDTO,
  RefundRequestDTO,
} from "@effy/shared-types";

import { COUNTED_REFUND_STATUSES, imageUrlOrNull, keysetListPage, operatingStamp, packageStatuses, query, stageFor, type Queryable } from "@effy/edge-shared";
import type { ListPage } from "@effy/shared-types";

import type { OrderListRequest } from "./list";
import { CONSIGNMENT_PROBLEMS, leastAdvanced, parcelCustodyOf, type AdminPackageHandoverDTO, type OrderAssignment, type PackageStatusView, type ParcelZone } from "@effy/shared-types";

import { judgePromise } from "./promise";
import { consignmentsFor, deliveryMovesFor, nextCourierPickup, parseClock } from "@effy/edge-shared/delivery";
import * as refundRepo from "./refunds";
import { assignmentsFor } from "./assignments";
import * as repo from "./repository";

// The stage word and refund statuses come from the shared library, as the shopper's page does.
export { COUNTED_REFUND_STATUSES, stageFor };

/** Ordered by whose money is at stake: an unsuppliable portion before a late package. */
function awaitingFor(handover: number, arrival: number, unfulfillable = 0, courierProblems = 0): OrderAwaiting | null {
  if (unfulfillable > 0) return "refund_decision";
  // A courier problem: the customer is waiting on Effy.
  if (courierProblems > 0) return "courier_problem";
  if (handover > 0) return "handover";
  if (arrival > 0) return "arrival";
  return null;
}

/** Through `query`, so container tests ask their own database. */
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
    deliveryType: row.delivery_type,
    promise: row.delivery_type === "effy" ? row.delivery_promise! : null,
    // The least advanced package's status.
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

export async function orderViewCounts(
  filters: repo.ListParams,
): Promise<import("@effy/shared-types").AdminOrderViewCountsDTO> {
  const r = await repo.viewCounts(filters);
  return {
    all: Number(r.total),
    needsDriver: Number(r.needs_driver),
    handover: Number(r.handover),
    arrival: Number(r.arrival),
    refundDecision: Number(r.refund_decision),
    courierProblem: Number(r.courier_problem),
  };
}

export async function ordersToday(): Promise<import("@effy/shared-types").AdminOrdersTodayDTO> {
  const r = await repo.today(COUNTED_REFUND_STATUSES);
  return {
    date: r.date,
    effy: Number(r.effy),
    courier: Number(r.courier),
    refunded: { orders: Number(r.refunded_orders), amount: Number(r.refunded_amount).toFixed(2), currency: "AUD" },
  };
}

/** One page of the Orders list (103): keyset-paged, with a capped count of everything it holds. */
export async function listOrders(req: OrderListRequest): Promise<ListPage<AdminOrderSummaryDTO>> {
  const [rows, count] = await Promise.all([repo.list(req), repo.countList(req)]);
  const page = rows.slice(0, req.pageSize);
  const ids = page.flatMap((r) => r.package_ids ?? []);
  const [statuses, assignments] = await Promise.all([packageStatuses(db, ids), assignmentsFor(ids)]);
  return keysetListPage(rows, req, count, (r) => toSummary(r, statuses, assignments));
}

/** The label is a short-lived presigned read, never public. */
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

export function toPackage(
  row: repo.PackageRow,
  statusView: PackageStatusView | null = null,
  assignment: { collect: OrderAssignment | null; deliver: OrderAssignment | null } = { collect: null, deliver: null },
  consignment: ConsignmentDTO | null = null,
  now: Date = new Date(),
): AdminOrderPackageDTO {
  const dueOut = row.courier_collection === "hub" && !row.handoff_at ? courierDueOut(row, now) : null;
  // Derived, never stored.
  const verdict = judgePromise({
    courierDueOut: row.courier_collection === "hub" ? courierDueOut(row, now) : null,
    handoffAt: row.handoff_at,
    now,
    deliveredBy: row.delivered_by,
    placedDate: row.placed_date,
    promisedDate: row.promised_date,
    windowEnd: row.window_end,
    today: row.today,
    handoffDate: row.handoff_date,
    arrivedAt: row.arrival_at,
    arrivalDate: row.arrival_date,
  });
  // A booked supplier pickup past its day with no handover is late too.
  const pickupLate = row.courier_collection === "supplier" && !row.handoff_at && consignment?.pickup !== undefined && consignment?.pickup !== null
    && consignment.pickup.date < row.today;
  return {
    // From the dispatch rows, not the shop's `status`, which stops at `collected`.
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
    packageCode: row.package_code,
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
          // Null is a complete state: no placeholder.
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
    variantId: row.variant_id,
    productName: row.product_name,
    variantLabel: row.variant_label,
    variantCode: row.variant_code,
    sku: row.sku,
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
  // Absent when not captured; the console omits the line.
  if (!row.method_type) return null;
  return { type: row.method_type, brand: row.method_brand, last4: row.method_last4 };
}

export async function getOrder(orderId: string): Promise<AdminOrderDetailDTO | null> {
  const order = await repo.findOrder(orderId);
  if (!order) return null;

  // In parallel: each RDS hop is ~135 ms.
  const [itemRows, packageRows, historyRows, typeRows, refundRows, refundLineRows, proposedRows, requestRow] =
    await Promise.all([
      repo.items(orderId),
      repo.packages(orderId),
      repo.history(orderId),
      repo.deliveryTypeHistory(orderId),
      refundRepo.refunds(orderId),
      refundRepo.refundLines(orderId),
      refundRepo.proposedRefunds(orderId),
      refundRepo.refundRequest(orderId),
    ]);
  // A second hop, only when an open request exists.
  const requestItemRows = requestRow ? await refundRepo.refundRequestItems(requestRow.request_id) : [];

  const pkgIds = packageRows.map((p) => p.fulfillment_id);
  const [statusById, assignmentById, consignmentById, collectionHistory, deliveryMoves, handoverRows] = await Promise.all([
    packageStatuses(db, pkgIds),
    assignmentsFor(pkgIds),
    order.delivery_type === "courier" ? consignmentsFor(db, pkgIds) : Promise.resolve(new Map()),
    order.delivery_type === "courier" ? repo.courierCollectionHistory(orderId) : Promise.resolve([]),
    order.delivery_type ? deliveryMovesFor(db, orderId) : Promise.resolve([]),
    repo.handovers(pkgIds),
  ]);
  const parcelRows = await repo.parcels(pkgIds);
  const toHandover = (h: repo.HandoverRow) => ({
    step: h.step as AdminPackageHandoverDTO["step"],
    method: h.method as AdminPackageHandoverDTO["method"],
    at: h.recorded_at.toISOString(),
    driverName: h.driver_name,
    actor: h.actor_kind,
    ...(h.parcel_code ? { parcelCode: h.parcel_code } : {}),
  });
  const consignments = new Map(
    await Promise.all([...consignmentById].map(async ([id, c]) => [id, await toConsignment(c)] as const)),
  );
  const packages = packageRows.map((p) => ({
    ...toPackage(p, statusById.get(p.fulfillment_id) ?? null, assignmentById.get(p.fulfillment_id), consignments.get(p.fulfillment_id) ?? null),
    handovers: handoverRows.filter((h) => h.package_id === p.fulfillment_id).map(toHandover),
    parcels: parcelRows
      .filter((b) => b.package_id === p.fulfillment_id)
      .map((b) => ({
        parcelId: b.parcel_id,
        code: b.parcel_code,
        seq: Number(b.seq),
        of: Number(b.of),
        zone: b.zone as ParcelZone,
        voided: b.voided,
        printedCount: Number(b.print_count),
        custody: parcelCustodyOf(b.last_step),
        handovers: handoverRows.filter((h) => h.parcel_id === b.parcel_id).map(toHandover),
      })),
  }));
  const statuses = packageRows.map((p) => p.status);
  const awaitingHandover = packageRows.filter(
    // The same definition as the list's badge and filter.
    (p) => p.status === "collected" && p.delivered_by === "courier" && !p.handoff_at,
  ).length;
  const awaitingArrival = packageRows.filter((p) => !p.arrival_at).length;
  // A partial refund for something else does not answer this.
  const awaitingRefundDecision = packageRows.filter(
    (p) => p.status === "unfulfillable",
  ).length;
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
    deliveryType: order.delivery_type,
    deliveryTypeReason: order.delivery_type_reason,
    courierEstimate: order.courier_estimate,
    promise: order.delivery_type === "effy" ? order.delivery_promise! : null,
    asapEstimate: order.asap_estimate ?? null,
    courierCollection: order.courier_collection ?? null,
    deliveryMoves,
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
    // Staff gateway only.
    deliveryFeeBreakdown: order.delivery_fee_breakdown,
    discountAmount: order.discount_amount,
    promoCode: order.promo_code,
    // With each promotion's internal name for staff.
    promotions: order.promotions
      ? order.promotions.map((p) => ({ name: p.name, headline: p.headline ?? p.name, code: p.code, goodsAmount: p.goods, deliveryAmount: p.delivery }))
      : order.promo_code && order.discount_amount !== "0.00"
        ? [{ name: order.promo_code, headline: order.promo_code, code: order.promo_code, goodsAmount: order.discount_amount, deliveryAmount: "0.00" }]
        : [],
    deliveryDiscountAmount: order.delivery_discount_amount,
    grandTotalAmount: order.grand_total_amount,
    currency: order.currency,

    paymentStatus: order.payment_status ?? "unknown",
    paymentMethod: toPaymentMethod(order),

    deliveryAddress: order.delivery_address,
    billingAddress: order.billing_address,
    // Null when the customer said nothing; never a default sentence.
    deliveryInstructions:
      order.delivery_handover === null && order.delivery_note === null
        ? null
        : { handover: order.delivery_handover, note: order.delivery_note },

    // Finished only when every package has arrived.
    finished: packageRows.length > 0 && awaitingArrival === 0,
    awaiting: awaitingFor(awaitingHandover, awaitingArrival, awaitingRefundDecision, courierProblems),

    ...refundView(order.grand_total_amount, itemRows, refundRows, refundLineRows),
    ...paymentSplitView(order, refundRows),
    proposedRefunds: proposedRows.map((p) => ({
      orderItemId: p.order_item_id,
      productName: p.product_name,
      quantity: p.quantity,
      amount: p.amount,
      reason: "item_not_supplied" as const,
    })),
    refundRequest: requestRow ? toRefundRequest(requestRow, requestItemRows) : null,
  };
}

/** Summed in integer cents and formatted once. */
/** Absent when no points were used. The shared refund service splits card and points. */
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

  // By the same status set as the money, or the ceiling's halves would disagree.
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
      // The kind distinguishes "nobody did this" (system) from "could not resolve who".
      actorKind: r.actor_kind as RefundDTO["actorKind"],
      actorLabel: r.actor_label,
      createdAt: r.created_at.toISOString(),
      settledAt: r.settled_at ? r.settled_at.toISOString() : null,
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
        variantLabel: i.variant_label,
        unitPriceAmount: i.unit_price_amount,
        quantity: i.quantity - (usedUnits.get(i.order_item_id) ?? 0),
      }))
      // A fully refunded line is omitted, not shown at zero.
      .filter((l) => l.quantity > 0),
  };
}

/** `round`, because `12.34 * 100` is `1233.9999…`. */
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

/** Its service's next pickup after it reached the hub (or from now); null with no pickup days. */
export function courierDueOut(
  r: { courier_order: boolean; checked_in_at: Date | null; service_weekdays: number[] | null; service_cutoff: string | null },
  now: Date,
): Date | null {
  if (!r.courier_order || !r.service_weekdays || r.service_weekdays.length === 0 || !r.service_cutoff) return null;
  return nextCourierPickup(r.checked_in_at ?? now, r.service_weekdays, parseClock(r.service_cutoff));
}

const BUSINESS_DAY_MS = 24 * 3600_000;
/** Weekdays only. */
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
  const dueOn = dueOut ? melbourneDay(dueOut) : r.placed_at ? melbourneDay(r.placed_at) : r.today;
  const handed = r.handed_over_at !== null;
  const problem = r.consignment_state && (CONSIGNMENT_PROBLEMS as readonly string[]).includes(r.consignment_state) ? r.consignment_state : null;

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

/** Courier parcels at or due at the hub, by the day they must leave. Supplier pickups never appear. */
/** Late courier parcels by place: hub, supplier or with the courier (`toCourierRow`). */
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
  return rows.sort((a, b) => Number(b.atRisk) - Number(a.atRisk) || a._sort - b._sort || a.orderNumber.localeCompare(b.orderNumber)).slice(0, 200).map(strip);
}
