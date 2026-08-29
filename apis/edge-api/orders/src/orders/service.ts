// Back-office order use-cases (053 US1). Maps rows to DTOs; no SQL here, no HTTP here.

import type {
  AdminOrderDetailDTO,
  AdminOrderHistoryEntryDTO,
  AdminOrderItemDTO,
  AdminOrderPackageDTO,
  AdminOrderSummaryDTO,
  AdminPaymentMethodDTO,
  ArrivalSource,
  OrderAwaiting,
  OrderStage,
  OrderStatus,
  RefundDTO,
  RefundRequestDTO,
} from "@effy/shared-types";

import * as refundRepo from "./refunds";
import * as repo from "./repository";

/**
 * Which refund statuses count against the amount already refunded.
 *
 * ⚠ THIS SET IS THE AUTHORITY'S, NOT OURS. `core-api`'s `refundedCents` decides it, inside the row
 * lock, and that is the only decision that can refuse a refund. Everything computed here is a
 * DISPLAY of that rule, so if the two sets drift the console shows staff a ceiling the server will
 * not honour — and they would discover it by having a refund refused for a reason the screen said
 * was impossible. A drift guard in `service.test.ts` reads the Go constant and fails if they differ,
 * the same mechanism 053 built for `stage.go`.
 *
 * ⚠ `submitting` is out because no money is on its way yet; `failed` is IN because it is money the
 * platform attempted to return and staff must resolve — freeing the ceiling would let a bouncing
 * retry refund an order repeatedly.
 */
export const COUNTED_REFUND_STATUSES: readonly string[] = ["submitted", "succeeded", "failed"];

/** Page size. Capped so a mistyped `limit` cannot ask for the whole table. */
export const MAX_LIMIT = 100;
export const DEFAULT_LIMIT = 25;

/**
 * The customer-facing progress word.
 *
 * ⚠ THIS MIRRORS `core-api`'s `orders/stage.go` AND MUST NOT DIVERGE FROM IT. The console shows an
 * operator what the CUSTOMER is currently being told, so a second opinion here would mean staff
 * reassuring someone about a status the shopper cannot see — 033's `available` flag and 029's banner
 * target, where one name meant two things and the disagreement was silent because both sides still
 * rendered something.
 *
 * It is a ROLLUP, NOT A MAX: the order is only as far along as its LEAST advanced package.
 * `ready_for_pickup` scores 1 — packed and waiting at the shop is NOT departed (053 FR-016).
 */
const RANK: Record<string, number> = {
  pending: 0,
  received: 1,
  picking: 1,
  ready_for_pickup: 1,
  collected: 2,
  delivered: 3,
};
const STAGE_BY_RANK: OrderStage[] = ["confirmed", "packing", "on_the_way", "delivered"];

export function stageFor(statuses: readonly string[]): OrderStage {
  if (statuses.length === 0) return "confirmed";
  let least = 3;
  for (const s of statuses) {
    // An unrecognised status scores 0 — a future status this build has never heard of must not be
    // able to advance anyone's view of an order.
    const r = RANK[s] ?? 0;
    if (r < least) least = r;
  }
  return STAGE_BY_RANK[least]!;
}

function awaitingFor(handover: number, arrival: number): OrderAwaiting | null {
  if (handover > 0) return "handover";
  if (arrival > 0) return "arrival";
  return null;
}

export function toSummary(row: repo.OrderSummaryRow): AdminOrderSummaryDTO {
  return {
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
    awaiting: awaitingFor(row.awaiting_handover, row.awaiting_arrival),
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
  return { items: page.map(toSummary), nextCursor };
}

function toPackage(row: repo.PackageRow): AdminOrderPackageDTO {
  return {
    fulfillmentId: row.fulfillment_id,
    shopId: row.shop_id,
    shopName: row.shop_name,
    status: row.status,
    itemCount: row.item_count,
    subtotalAmount: row.subtotal_amount,
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
  const [itemRows, packageRows, historyRows, refundRows, refundLineRows, proposedRows, requestRow] =
    await Promise.all([
      repo.items(orderId),
      repo.packages(orderId),
      repo.history(orderId),
      refundRepo.refunds(orderId),
      refundRepo.refundLines(orderId),
      refundRepo.proposedRefunds(orderId),
      refundRepo.refundRequest(orderId),
    ]);
  // ⚠ A SECOND HOP, and deliberately not folded into the wave above: the items belong to a request
  // that may not exist, and asking for them unconditionally would query on a foreign key we have not
  // read yet. It costs one round trip on the rare order that HAS an open request, and none otherwise.
  const requestItemRows = requestRow ? await refundRepo.refundRequestItems(requestRow.request_id) : [];

  const packages = packageRows.map(toPackage);
  const statuses = packageRows.map((p) => p.status);
  const awaitingHandover = packageRows.filter(
    (p) => p.status === "collected" && (p.method ?? "standard") === "standard" && !p.handoff_at,
  ).length;
  const awaitingArrival = packageRows.filter((p) => !p.arrival_at).length;

  return {
    id: order.id,
    orderNumber: order.order_number,
    status: order.status as OrderStatus,
    stage: stageFor(statuses),
    placedAt: order.placed_at ? order.placed_at.toISOString() : null,
    createdAt: order.created_at.toISOString(),

    customerId: order.customer_id,
    customerEmail: order.customer_email,
    customerName: order.customer_name,

    items: itemRows.map(toItem),
    packages,
    history: historyRows.map(toHistory),

    itemSubtotalAmount: order.item_subtotal_amount,
    deliveryFeeAmount: order.delivery_fee_amount,
    discountAmount: order.discount_amount,
    promoCode: order.promo_code,
    grandTotalAmount: order.grand_total_amount,
    currency: order.currency,

    paymentStatus: order.payment_status ?? "unknown",
    paymentMethod: toPaymentMethod(order),

    deliveryAddress: order.delivery_address,
    billingAddress: order.billing_address,

    // FR-007 — a rollup: finished only when EVERY package has arrived.
    finished: packageRows.length > 0 && awaitingArrival === 0,
    awaiting: awaitingFor(awaitingHandover, awaitingArrival),

    ...refundView(order.grand_total_amount, itemRows, refundRows, refundLineRows),
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
      actorLabel: r.actor_label,
      createdAt: r.created_at.toISOString(),
      settledAt: r.settled_at ? r.settled_at.toISOString() : null,
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
