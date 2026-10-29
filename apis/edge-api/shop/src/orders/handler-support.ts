// The gate and error mapping are the fulfilment slice's: same audience, same rules.

import type {
  ShopOrderDetailDTO,
  ShopOrderListDTO,
  ShopOrderRowDTO,
} from "@effy/shared-types";

import type { OrderDetail, OrderList, OrderRow } from "./types";

export { gate, mapFulfillmentError as mapOrderError } from "../fulfillments/handler-support";

function toRowDTO(r: OrderRow): ShopOrderRowDTO {
  return {
    id: r.id,
    orderNumber: r.orderNumber,
    customerName: r.customerName,
    placedAt: r.placedAt.toISOString(),
    status: r.status,
    statusView: r.statusView,
    itemCount: r.itemCount,
    gatheredCount: r.gatheredCount,
    unavailableCount: r.unavailableCount,
    deliveredBy: r.deliveredBy,
    ...(r.courierPickup ? { courierPickup: r.courierPickup } : {}),
    ...(r.collection ? { collection: { ...r.collection } } : {}),
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
    totalCapped: false,
    page: l.page,
    pageSize: l.pageSize,
    nextCursor: null,
    ignored: [],
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
    statusView: d.statusView,
    stateChangedAt: d.stateChangedAt.toISOString(),
    readyBy: d.readyBy.toISOString(),
    deliveredBy: d.deliveredBy,
    ...(d.courierPickup ? { courierPickup: d.courierPickup } : {}),
    ...(d.collection ? { collection: { ...d.collection } } : {}),
    atRisk: d.atRisk,
    delivery: { ...d.delivery },
    parcels: d.parcels.map((p) => ({ ...p, printed: { ...p.printed }, packScanned: p.packScanned ? { ...p.packScanned } : null })),
    labelCommon: { ...d.labelCommon },
    zonesNeeded: [...d.zonesNeeded],
    packScanRequired: d.packScanRequired,
    lines: d.lines.map((l) => ({ ...l })),
    money: { ...d.money },
    payment: { ...d.payment, paidAt: iso(d.payment.paidAt) },
    refunds: d.refunds.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    handoff: {
      deliveredAt: iso(d.handoff.deliveredAt),
      unfulfillableReason: d.handoff.unfulfillableReason,
    },
    tags: [...d.tags],
    notes: d.notes.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })),
  };
}

