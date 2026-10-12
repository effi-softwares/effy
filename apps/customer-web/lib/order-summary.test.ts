import type { OrderSummaryDTO } from "@effy/shared-types"
import { describe, expect, it } from "vitest"

import { inPeriod, matchesFilter, orderRowWords, periodsFor } from "./order-summary"

const NOW = new Date("2026-10-12T02:00:00Z") // midday in Melbourne
const order = (over: Partial<OrderSummaryDTO> = {}): OrderSummaryDTO => ({
  id: "o1", orderNumber: "EF-1", status: "paid", placedAt: "2026-10-12T00:00:00Z", itemCount: 3,
  grandTotalAmount: "26.00", currency: "AUD", ...over,
})
const window = { method: "same_day" as const, promisedFrom: null, promisedTo: null, windowStart: "2026-10-12T16:00:00+11:00", windowEnd: "2026-10-12T18:00:00+11:00" }

describe("what an order row says", () => {
  it("a confirmed order says when it is arriving", () => {
    const w = orderRowWords(order({ stage: "confirmed", arrivalEstimates: [window] }), NOW)
    expect(w).toMatchObject({ badge: "Confirmed", inProgress: true })
    expect(w.line).toMatch(/^Arriving today, /)
  })

  it("an order on the way says so, with its window", () => {
    const w = orderRowWords(order({ stage: "on_the_way", arrivalEstimates: [window] }), NOW)
    expect(w.badge).toBe("On the way")
    expect(w.line).toMatch(/^On the way — today, /)
  })

  it("a delivered order says when it arrived, in Melbourne time", () => {
    const w = orderRowWords(order({ stage: "delivered", deliveredAt: "2026-10-05T06:12:00Z" }), NOW)
    expect(w).toMatchObject({ badge: "Delivered", tone: "brand", inProgress: false })
    expect(w.line).toMatch(/^Delivered 5 Oct, 5:12/)
  })

  it("⚠ a courier estimate is always said as an estimate", () => {
    const w = orderRowWords(order({ stage: "confirmed", delivery: { type: "courier", courierEstimate: "2 to 4 business days" } }), NOW)
    expect(w.line).toContain("an estimate, not a guaranteed date")
  })

  it("a full refund outranks the stage; a cancelled order outranks everything", () => {
    expect(orderRowWords(order({ stage: "delivered", fullyRefunded: true, refundedTotal: "26.00" })).badge).toBe("Refunded")
    expect(orderRowWords(order({ status: "canceled", fullyRefunded: true })).badge).toBe("Cancelled")
  })

  it("never invents an arrival for an order with no promise on record", () => {
    const none = { method: "standard" as const, promisedFrom: null, promisedTo: null, windowStart: null, windowEnd: null }
    expect(orderRowWords(order({ stage: "packing", arrivalEstimates: [none] }), NOW).line).toBe("Your order is being packed")
  })

  it("a row from a server without the new fields still reads sensibly", () => {
    expect(orderRowWords(order())).toEqual({ badge: "Paid", tone: "outline", line: null, inProgress: false })
  })
})

describe("the filters", () => {
  it("put each order where its badge says it is", () => {
    const moving = order({ stage: "packing" })
    const done = order({ stage: "delivered" })
    const partRefund = order({ stage: "delivered", refundedTotal: "6.00" })
    const cancelled = order({ status: "canceled" })
    expect([moving, done, partRefund, cancelled].map((o) => matchesFilter(o, "progress"))).toEqual([true, false, false, false])
    expect([moving, done, partRefund, cancelled].map((o) => matchesFilter(o, "delivered"))).toEqual([false, true, true, false])
    expect([moving, done, partRefund, cancelled].map((o) => matchesFilter(o, "refunded"))).toEqual([false, false, true, false])
    expect([moving, done, partRefund, cancelled].map((o) => matchesFilter(o, "cancelled"))).toEqual([false, false, false, true])
  })
})

describe("the time period", () => {
  it("offers the last three months, each year an order was placed in, and everything", () => {
    expect(periodsFor([order(), order({ placedAt: "2025-03-01T00:00:00Z" })]).map((p) => p.key)).toEqual(["recent", "2026", "2025", "all"])
  })

  it("keeps an order in the periods it belongs to", () => {
    const old = order({ placedAt: "2026-03-01T00:00:00Z" })
    expect(inPeriod(old, "recent", NOW)).toBe(false)
    expect(inPeriod(old, "2026", NOW)).toBe(true)
    expect(inPeriod(old, "all", NOW)).toBe(true)
    expect(inPeriod(order(), "recent", NOW)).toBe(true)
  })
})
