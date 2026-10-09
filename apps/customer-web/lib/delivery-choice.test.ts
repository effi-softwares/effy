import { describe, expect, it } from "vitest"

import type { DeliveryQuoteDTO } from "@effy/shared-types"

import { carryWindow, chosenFee, courierOf, dayOffset, deliveryTypeOf, effyWindowsOf, findWindow, holdLapsed, isFreeDelivery } from "./delivery-choice"

const fee = (total: string, surcharge?: string) => ({
  lines: [{ kind: "delivery" as const, amount: "6.00" }, ...(surcharge ? [{ kind: "window_surcharge" as const, amount: surcharge }] : [])],
  totalAmount: total,
})
const win = (slotId: string, date: string, total: string, surcharge?: string) => ({
  slotId, date, startAt: `${date}T17:00:00+11:00`, endAt: `${date}T19:00:00+11:00`, cutoffAt: `${date}T15:00:00+11:00`,
  surchargeAmount: surcharge ?? "0.00", fee: fee(total, surcharge),
})
const TODAY = "2026-10-08"
const LATER = "2026-10-09"

/** Effy delivers: one window today ($5 dearer) and the same window tomorrow at the plain fee. */
const EFFY: DeliveryQuoteDTO = {
  postcode: "3000", serviced: true, coverage: "effy", expiresAt: "2026-10-08T12:00:00+11:00",
  effyWindows: {
    unavailable: null,
    days: [
      { date: TODAY, section: "same_day", closedReason: null, windows: [win("evening", TODAY, "11.00", "5.00")] },
      { date: LATER, section: "standard", closedReason: null, windows: [win("evening", LATER, "6.00")] },
    ],
  },
}
const COURIER: DeliveryQuoteDTO = {
  postcode: "7000", serviced: true, coverage: "courier", expiresAt: "2026-10-08T12:00:00+11:00",
  courier: { estimate: "2–4 business days", reason: "out_of_coverage", fee: { lines: [{ kind: "delivery", amount: "9.00" }], totalAmount: "9.00" } },
}
const NONE: DeliveryQuoteDTO = { postcode: "9999", serviced: false, coverage: "none", expiresAt: "" }

describe("what a quote offers", () => {
  it("Effy's windows, a courier, or nothing — and who delivers follows from it", () => {
    expect(effyWindowsOf(EFFY)?.days).toHaveLength(2)
    expect(courierOf(EFFY)).toBeNull()
    expect(deliveryTypeOf(EFFY)).toBe("effy")

    expect(effyWindowsOf(COURIER)).toBeNull()
    expect(courierOf(COURIER)?.estimate).toBe("2–4 business days")
    expect(deliveryTypeOf(COURIER)).toBe("courier")

    for (const q of [NONE, null]) {
      expect(effyWindowsOf(q)).toBeNull()
      expect(courierOf(q)).toBeNull()
      expect(deliveryTypeOf(q)).toBeNull()
    }
  })

  it("a window is a slot ON A DAY: the same slot on another day is another window", () => {
    expect(findWindow(EFFY, { slotId: "evening", date: TODAY })?.fee.totalAmount).toBe("11.00")
    expect(findWindow(EFFY, { slotId: "evening", date: LATER })?.fee.totalAmount).toBe("6.00")
    expect(findWindow(EFFY, { slotId: "evening", date: "2026-10-12" })).toBeNull()
    expect(findWindow(EFFY, { slotId: "morning", date: TODAY })).toBeNull()
    expect(findWindow(EFFY, null)).toBeNull()
    expect(dayOffset(EFFY.effyWindows!, TODAY)).toBe(0)
    expect(dayOffset(EFFY.effyWindows!, LATER)).toBe(1)
    expect(dayOffset(EFFY.effyWindows!, "2026-10-12")).toBe(-1)
  })
})

describe("chosenFee — one fee for the order, picked and never added to", () => {
  it("nothing to show until a window is chosen; then exactly that window's fee", () => {
    expect(chosenFee(EFFY, null)).toBeNull()
    expect(chosenFee(EFFY, { slotId: "evening", date: TODAY })).toEqual(fee("11.00", "5.00"))
    expect(chosenFee(EFFY, { slotId: "evening", date: LATER })).toEqual(fee("6.00"))
    // A window that is no longer offered has no fee — never the nearest one's.
    expect(chosenFee(EFFY, { slotId: "evening", date: "2026-10-12" })).toBeNull()
  })

  it("a courier order has one fee and nothing to choose", () => {
    expect(chosenFee(COURIER, null)?.totalAmount).toBe("9.00")
    expect(chosenFee(COURIER, { slotId: "evening", date: TODAY })?.totalAmount).toBe("9.00")
  })

  it("no fee for an address nobody delivers to", () => {
    expect(chosenFee(NONE, null)).toBeNull()
    expect(chosenFee(null, null)).toBeNull()
  })

  it("free delivery is read from the lines", () => {
    expect(isFreeDelivery(fee("6.00"))).toBe(false)
    expect(isFreeDelivery({ lines: [{ kind: "delivery", amount: "6.00" }, { kind: "free_delivery", amount: "-6.00" }], totalAmount: "0.00" })).toBe(true)
    expect(isFreeDelivery(null)).toBe(false)
  })
})

describe("carrying the window across a new quote", () => {
  const chosen = { slotId: "evening", date: TODAY }

  it("keeps a window that is still on offer", () => {
    expect(carryWindow(EFFY, chosen)).toEqual(chosen)
  })

  it("⚠ drops a window that has gone and selects NOTHING in its place", () => {
    const gone: DeliveryQuoteDTO = { ...EFFY, effyWindows: { unavailable: null, days: [{ ...EFFY.effyWindows!.days[0]!, windows: [], closedReason: "closed" }, EFFY.effyWindows!.days[1]!] } }
    expect(carryWindow(gone, chosen)).toBeNull()
    expect(carryWindow(COURIER, chosen)).toBeNull()
    expect(carryWindow(null, chosen)).toBeNull()
  })
})

describe("holdLapsed — must the place be renewed before paying?", () => {
  const until = "2026-10-08T15:10:00+11:00"
  const at = (iso: string) => Date.parse(iso)

  it("is live until the moment it lapses, and lapsed from then on", () => {
    expect(holdLapsed(until, at("2026-10-08T15:09:59+11:00"))).toBe(false)
    expect(holdLapsed(until, at("2026-10-08T15:10:00+11:00"))).toBe(true)
    expect(holdLapsed(until, at("2026-10-08T16:00:00+11:00"))).toBe(true)
  })

  it("a courier order holds nothing, so there is nothing to renew", () => {
    expect(holdLapsed(undefined, Date.now())).toBe(false)
    expect(holdLapsed(null, Date.now())).toBe(false)
    expect(holdLapsed("", Date.now())).toBe(false)
  })

  it("a malformed value is treated as no hold, never as a reason to block payment", () => {
    expect(holdLapsed("not-a-time", Date.now())).toBe(false)
  })
})
