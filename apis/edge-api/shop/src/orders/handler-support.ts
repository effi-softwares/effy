// Domain → wire DTO mappers for the shop order console (057 A3). The gate and the error mapping are
// the fulfilment slice's, reused as-is: same audience, same membership rule (both roles, FR-019a),
// same uniform 403 for "missing" and "another shop's".

import type {
  ShopOrderActivityDTO,
  ShopOrderDetailDTO,
  ShopOrderListDTO,
  ShopOrderRowDTO,
} from "@effy/shared-types";

import type { ActivityEntry, OrderDetail, OrderList, OrderRow } from "./types";

export { gate, mapFulfillmentError as mapOrderError } from "../fulfillments/handler-support";

function toRowDTO(r: OrderRow): ShopOrderRowDTO {
  return {
    id: r.id,
    orderNumber: r.orderNumber,
    customerName: r.customerName,
    placedAt: r.placedAt.toISOString(),
    status: r.status,
    itemCount: r.itemCount,
    gatheredCount: r.gatheredCount,
    unavailableCount: r.unavailableCount,
    deliveryMethod: r.deliveryMethod,
    atRisk: r.atRisk,
    payment: r.payment,
    total: r.total,
    currency: r.currency,
    tags: r.tags,
    itemsSummary: r.itemsSummary,
  };
}

export function toListDTO(l: OrderList): ShopOrderListDTO {
  return {
    items: l.items.map(toRowDTO),
    total: l.total,
    page: l.page,
    pageSize: l.pageSize,
    counts: { ...l.counts },
  };
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export function toOrderDTO(d: OrderDetail): ShopOrderDetailDTO {
  return {
    id: d.id,
    orderId: d.orderId,
    orderNumber: d.orderNumber,
    placedAt: d.placedAt.toISOString(),
    status: d.status,
    stateChangedAt: d.stateChangedAt.toISOString(),
    readyBy: d.readyBy.toISOString(),
    deliveryMethod: d.deliveryMethod,
    atRisk: d.atRisk,
    delivery: { ...d.delivery },
    lines: d.lines.map((l) => ({ ...l })),
    money: { ...d.money },
    payment: { ...d.payment, paidAt: iso(d.payment.paidAt) },
    refunds: d.refunds.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    handoff: {
      collectedAt: iso(d.handoff.collectedAt),
      deliveredAt: iso(d.handoff.deliveredAt),
      unfulfillableReason: d.handoff.unfulfillableReason,
    },
    tags: [...d.tags],
    notes: d.notes.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })),
  };
}

export function toActivityDTO(entries: ActivityEntry[]): ShopOrderActivityDTO {
  return { entries: entries.map((e) => ({ ...e, at: e.at.toISOString() })) };
}
