// TEMPORARY sample data for the visual harness.
const iso = (h: number, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
const pv = (status: string, word: string) => ({ status, word, detail: null, driverName: null });
export const SEED: [readonly unknown[], unknown][] = [
  [["auth", "session"], { status: "signed-in", identity: { subject: "x", email: "alex.chen@example.com", roles: ["manager"] } }],
  [["dispatch", "day"], { rounds: [
    { round: { id: "r1", kind: "collection" }, driverId: "d1", driverName: "Sam Rivers", stopsRemaining: 3, packagesRemaining: 5, isLate: false, stageLabel: "2 of 5 shops" },
    { round: { id: "r2", kind: "delivery" }, driverId: "d2", driverName: "Mia Thompson", stopsRemaining: 5, packagesRemaining: 5, isLate: false, stageLabel: "out 6 of 11" },
  ], unassigned: [1, 2, 3, 4] }],
  [["exceptions", "list", false], { exceptions: [
    { exceptionId: "e1", resolvedAt: null, packageLocation: "with_driver" }, { exceptionId: "e2", resolvedAt: null, packageLocation: "with_driver" }, { exceptionId: "e3", resolvedAt: null, packageLocation: "at_hub" },
  ], openCount: 3, held: [{}], overdue: [{}], vehicleChecks: [{ checkId: "v", driverName: "Jordan Patel", unsafe: true, clearedAt: null }] }],
  [["orders", "list", { awaiting: "refund_decision" }], { items: [{}, {}], nextCursor: null }],
  [["orders", "today"], { date: "2026-10-18", effy: 118, courier: 9, refunded: { orders: 2, amount: "31.40", currency: "AUD" } }],
  [["product-review", "queue", {}], { items: [], nextCursor: null, total: 12 }],
  [["back-office", "feedback", "list", { status: "new", limit: 1 }], { items: [], total: 5, nextCursor: null }],
  [["back-office", "deliverability", "list", { limit: 1 }], { items: [], total: 2 }],
  [["back-office", "me"], { subject: "x", email: "alex.chen@example.com", roles: ["manager"], status: "active" }],
  [["drivers", "duty"], { onDuty: [
    { driverId: "d1", driverName: "Sam Rivers", pastExpectedEnd: false, expectedEndAt: null },
    { driverId: "d2", driverName: "Mia Thompson", pastExpectedEnd: false, expectedEndAt: null },
    { driverId: "d3", driverName: "Ashley Ward", pastExpectedEnd: true, expectedEndAt: iso(16, 30) },
    { driverId: "d4", driverName: "Jordan Patel", pastExpectedEnd: false, expectedEndAt: null },
    { driverId: "d5", driverName: "Lena Nguyen", pastExpectedEnd: false, expectedEndAt: null },
  ], unassigned: { readyToCollect: 5, readyToDeliver: 4, driversOnDuty: 5 } }],
  [["back-office", "delivery", "slots", "grid"], { items: [
    { id: "s1", startTime: "10:00", endTime: "12:00", cutoffTime: "08:00", capacity: 40, status: "active", bookedToday: 38, overCapacityToday: 0 },
    { id: "s2", startTime: "12:00", endTime: "14:00", cutoffTime: "10:00", capacity: 40, status: "active", bookedToday: 34, overCapacityToday: 0 },
    { id: "s3", startTime: "14:00", endTime: "16:00", cutoffTime: "12:00", capacity: 40, status: "active", bookedToday: 29, overCapacityToday: 0 },
    { id: "s4", startTime: "16:00", endTime: "18:00", cutoffTime: "14:00", capacity: 40, status: "active", bookedToday: 40, overCapacityToday: 0 },
    { id: "s5", startTime: "09:00", endTime: "21:00", cutoffTime: "18:00", capacity: 30, status: "active", bookedToday: 12, overCapacityToday: 0, anyTime: true },
  ] }],
  [["dispatch", "windows", "today"], { days: [], date: "", windows: [
    { windowStart: iso(10), windowEnd: iso(12), label: "", rounds: [{ roundId: "a", driver: { id: "d1", name: "Sam Rivers" }, opensAt: null, parcels: 5 }], parcels: [{ status: pv("delivered", "Delivered") }] },
    { windowStart: iso(12), windowEnd: iso(14), label: "", rounds: [{ roundId: "b", driver: { id: "d2", name: "Mia Thompson" }, opensAt: null, parcels: 5 }], parcels: [{ status: pv("out_for_delivery", "Out for delivery") }, { status: pv("at_hub", "At hub") }, { status: pv("at_hub", "At hub") }] },
    { windowStart: iso(14), windowEnd: iso(16), label: "", rounds: [{ roundId: "c", driver: { id: "d3", name: "Ashley Ward" }, opensAt: iso(13, 30), parcels: 5 }], parcels: Array(17).fill({ status: pv("at_hub", "At hub") }) },
  ] }],
];
const pv2 = (status: string, word: string) => ({ status, word, detail: null, driverName: null });
const orderList = { items: [
  { id: "o1", orderNumber: "EFY-20514", status: "paid", stage: "packing", placedAt: iso(13, 12), customerEmail: "hannah.lee@example.com", itemCount: 4, packageCount: 1, grandTotalAmount: "46.02", currency: "AUD", awaiting: null, statusView: pv2("preparing", "Preparing"), drivers: { collect: [], deliver: [] }, needsDriver: true, deliveryType: "effy", promise: "window" },
  { id: "o2", orderNumber: "EFY-20511", status: "paid", stage: "packing", placedAt: iso(12, 58), customerEmail: "r.okafor@example.com", itemCount: 4, packageCount: 1, grandTotalAmount: "88.15", currency: "AUD", awaiting: null, statusView: pv2("ready", "Ready"), drivers: { collect: ["Sam Rivers"], deliver: [] }, needsDriver: false, deliveryType: "effy", promise: "day" },
  { id: "o3", orderNumber: "EFY-20503", status: "paid", stage: "on_the_way", placedAt: iso(12, 20), customerEmail: "priya.s@example.com", itemCount: 4, packageCount: 1, grandTotalAmount: "52.70", currency: "AUD", awaiting: "refund_decision", statusView: pv2("problem", "Problem"), drivers: { collect: ["Sam Rivers"], deliver: ["Ashley Ward"] }, needsDriver: false, deliveryType: "effy", promise: "window" },
  { id: "o4", orderNumber: "EFY-20479", status: "paid", stage: "on_the_way", placedAt: iso(9, 31), customerEmail: "grace.w@example.com", itemCount: 4, packageCount: 1, grandTotalAmount: "39.90", currency: "AUD", awaiting: "arrival", statusView: pv2("with_carrier", "With carrier"), drivers: { collect: ["Lena Nguyen"], deliver: [] }, needsDriver: false, deliveryType: "courier", promise: null },
], nextCursor: "x" };
const assign = (name: string | null, how: string, movable = true) => ({ driver: name ? { id: "d", name } : null, how, movable, opensAt: null, dueAt: null, unassignedReason: name ? null : "No driver is on duty" });
const detail = {
  id: "o9", orderNumber: "EFY-20481", status: "paid", stage: "on_the_way", placedAt: iso(9, 42), createdAt: iso(9, 41),
  deliveryType: "effy", deliveryTypeReason: "in_coverage", courierEstimate: null, promise: "window", deliveryTypeHistory: [{ from: null, to: "effy", reason: "in_coverage", actor: { kind: "checkout" }, note: null, at: iso(9, 42) }],
  courierCollection: null, courierCollectionHistory: [], deliveryMoves: [],
  customerId: "c1", customerEmail: "tom.baker@example.com", customerName: "Tom Baker",
  items: [{ orderItemId: "i1", productName: "Greek yoghurt 170g", quantity: 6, unitPriceAmount: "2.20", lineSubtotalAmount: "13.20" }, { orderItemId: "i2", productName: "Sourdough loaf 750g", quantity: 1, unitPriceAmount: "6.50", lineSubtotalAmount: "6.50" }],
  packages: [
    { fulfillmentId: "f1", packageCode: "7K3Q9M", shopId: "s", shopName: "Brunswick store", status: "collected", itemCount: 7, subtotalAmount: "40", deliveredBy: "effy", consignment: null, dueOut: null, late: false, deliveryMethod: "same_day", handoff: null, arrival: null, promisedDate: "2026-10-19", window: null, statusView: pv2("out_for_delivery", "Out for delivery"),
      collect: assign("Sam Rivers", "Collected 11:42 am · auto-assigned — fewest packages today (2)", false), deliver: assign("Mia Thompson", "Round 12:00 – 14:00 · opened 11:30 am", false),
      handovers: [{ step: "collect", method: "scan", driverName: "Sam Rivers", at: iso(11, 42) }, { step: "checkin", method: "scan", driverName: "Sam Rivers", at: iso(12, 5) }, { step: "load", method: "typed", driverName: "Mia Thompson", at: iso(12, 18) }] },
    { fulfillmentId: "f2", packageCode: "R8PWX2", shopId: "s2", shopName: "Northcote store", status: "ready_for_pickup", itemCount: 4, subtotalAmount: "20", deliveredBy: "effy", consignment: null, dueOut: null, late: false, deliveryMethod: "same_day", handoff: null, arrival: null, promisedDate: "2026-10-19", window: null, statusView: pv2("ready", "Ready"),
      collect: assign(null, ""), deliver: null, handovers: [] },
  ],
  history: [{ at: iso(12, 18), kind: "driver", summary: "Loaded for delivery by Mia Thompson", actorSub: null, fulfillmentId: "f1" }, { at: iso(12, 5), kind: "handoff", summary: "Checked in at the hub", actorSub: null, fulfillmentId: "f1" }],
  itemSubtotalAmount: "62.45", deliveryFeeAmount: "10.00", discountAmount: "8.25", promoCode: "SPRING20", grandTotalAmount: "64.20", currency: "AUD",
  paymentStatus: "succeeded", paymentMethod: { type: "card", brand: "Visa", last4: "4242" },
  deliveryAddress: { recipientName: "Tom Baker", line1: "Unit 4, 18 Lygon Street", city: "Carlton", region: "VIC", postalCode: "3053" }, billingAddress: null,
  deliveryInstructions: null, finished: false, awaiting: null,
  refunds: [], refundedAmount: "0.00", refundableAmount: "64.20", refundableLines: [], proposedRefunds: [],
  refundRequest: { status: "open", message: "Two of the six yoghurts were split open.", items: [], createdAt: iso(13, 48) },
};
SEED.push([["orders", "list", { limit: 25 }], orderList]);
SEED.push([["orders", "views", {}], { all: 312, needsDriver: 4, handover: 3, arrival: 6, refundDecision: 2, courierProblem: 1 }]);
SEED.push([["orders", "detail", "o9"], detail]);
