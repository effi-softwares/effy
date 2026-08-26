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
} from "@effy/shared-types";

import * as repo from "./repository";

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
  const nextCursor =
    rows.length > params.limit && page.length > 0
      ? (page[page.length - 1]!.placed_at?.toISOString() ?? null)
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
  const [itemRows, packageRows, historyRows] = await Promise.all([
    repo.items(orderId),
    repo.packages(orderId),
    repo.history(orderId),
  ]);

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
  };
}
