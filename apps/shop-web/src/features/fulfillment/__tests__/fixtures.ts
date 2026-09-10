import type { OrderDetail, OrderList, OrderRow } from "../orderConsole"

/** Builders for the 057 A3 console contract — shaped exactly like the wire, so a test cannot drift. */

export function orderRow(over: Partial<OrderRow> = {}): OrderRow {
  return {
    id: "f1",
    orderNumber: "EFY-10023",
    customerName: "Maya Oyelaran",
    placedAt: "2026-09-10T02:14:05Z",
    status: "received",
    itemCount: 4,
    gatheredCount: 0,
    unavailableCount: 0,
    deliveryMethod: "standard",
    atRisk: false,
    payment: "paid",
    total: "57.80",
    currency: "AUD",
    tags: [],
    itemsSummary: "Barossa Free-Range Eggs 700g ×2, Oat milk 1L ×2",
    ...over,
  }
}

export function orderList(items: OrderRow[], over: Partial<OrderList> = {}): OrderList {
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: 25,
    counts: {
      all: items.length,
      new: items.filter((r) => r.status === "pending" || r.status === "received").length,
      picking: items.filter((r) => r.status === "picking").length,
      ready_for_pickup: items.filter((r) => r.status === "ready_for_pickup").length,
      collected: items.filter((r) => r.status === "collected").length,
      delivered: items.filter((r) => r.status === "delivered").length,
      unfulfillable: items.filter((r) => r.status === "unfulfillable").length,
      withdrawn: items.filter((r) => r.status === "withdrawn").length,
    },
    ...over,
  }
}

export function orderDetail(over: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: "f1",
    orderId: "11111111-1111-4111-8111-111111111111",
    orderNumber: "EFY-10023",
    placedAt: "2026-09-10T02:14:05Z",
    status: "picking",
    stateChangedAt: "2026-09-10T02:15:11Z",
    readyBy: "2026-09-10T03:14:05Z",
    deliveryMethod: "standard",
    atRisk: false,
    delivery: {
      recipientName: "Maya Oyelaran",
      phone: "0400 000 000",
      line1: "12 Riverina St",
      line2: null,
      city: "Melbourne",
      region: "VIC",
      postalCode: "3000",
      country: "AU",
    },
    lines: [
      {
        orderItemId: "oi1",
        name: "Barossa Free-Range Eggs 700g",
        sku: "EGG-700",
        imageUrl: null,
        orderedQuantity: 2,
        gatheredQuantity: 1,
        unavailableQuantity: 0,
        refundedQuantity: 0,
        unitPrice: "8.90",
        lineTotal: "17.80",
      },
    ],
    money: {
      currency: "AUD",
      shopSubtotal: "17.80",
      itemSubtotal: "47.80",
      deliveryFee: "10.00",
      discount: "0.00",
      promoCode: null,
      total: "57.80",
      refunded: "0.00",
      refundPending: "0.00",
      net: "57.80",
    },
    payment: {
      state: "paid",
      methodType: "card",
      methodBrand: "visa",
      methodLast4: "4242",
      amount: "57.80",
      paidAt: "2026-09-10T02:14:05Z",
    },
    refunds: [],
    handoff: { collectedAt: null, deliveredAt: null, unfulfillableReason: null },
    tags: [],
    notes: [],
    ...over,
  }
}
