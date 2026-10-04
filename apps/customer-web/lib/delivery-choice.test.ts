import { describe, expect, it } from "vitest"

import type { DeliveryQuoteDTO } from "@effy/shared-types"

import { carryDay, carrySlot, feesFor, holdLapsed, needs, shapeOf } from "./delivery-choice"

const STD = { method: "standard" as const, feeAmount: "6.00", promisedFrom: null, promisedTo: null }
const SD = { method: "same_day" as const, feeAmount: "11.00", promisedFrom: null, promisedTo: null }
const SLOT = {
  slotId: "slot-1", date: "2026-10-08",
  startAt: "2026-10-08T17:00:00+11:00", endAt: "2026-10-08T19:00:00+11:00", cutoffAt: "2026-10-08T15:00:00+11:00",
}

function quote(over: Partial<DeliveryQuoteDTO> = {}): DeliveryQuoteDTO {
  return {
    postcode: "3000", serviced: true, sameDayAvailableUntil: null, expiresAt: "2026-10-08T12:00:00+11:00",
    packages: [{ shopRef: "pkg-1", options: [STD, SD] }],
    sameDaySlots: [SLOT], sameDayUnavailableReason: null,
    standardDays: [{ date: "2026-10-09" }, { date: "2026-10-10" }],
    ...over,
  }
}
const MIXED = quote({
  packages: [{ shopRef: "pkg-1", options: [STD, SD] }, { shopRef: "pkg-2", options: [{ ...STD, feeAmount: "7.00" }] }],
})

describe("shapeOf", () => {
  it("offers same-day when a delivery can go today and a slot is open", () => {
    expect(shapeOf(quote())).toMatchObject({ sameDayOffered: true, mixed: false, deliveries: 1, sameDayDeliveries: 1 })
  })

  it("does not offer same-day with no open slot, even if the package lists the option", () => {
    expect(shapeOf(quote({ sameDaySlots: [] })).sameDayOffered).toBe(false)
  })

  it("⚠ offers same-day when ANY delivery can go today, and says the order is mixed", () => {
    expect(shapeOf(MIXED)).toMatchObject({ sameDayOffered: true, mixed: true, deliveries: 2, sameDayDeliveries: 1 })
  })

  it("offers nothing for no quote or an unserviced one", () => {
    expect(shapeOf(null).sameDayOffered).toBe(false)
    expect(shapeOf(quote({ serviced: false, packages: [] })).daysOffered).toBe(false)
  })
})

describe("needs", () => {
  it("standard needs a day and no slot", () => {
    expect(needs(shapeOf(quote()), "standard")).toEqual({ slot: false, day: true })
  })

  it("same-day needs a slot and no day when every delivery goes today", () => {
    expect(needs(shapeOf(quote()), "same_day")).toEqual({ slot: true, day: false })
  })

  it("a mixed order needs ONE slot and ONE day (SC-010)", () => {
    expect(needs(shapeOf(MIXED), "same_day")).toEqual({ slot: true, day: true })
  })

  it("asks for no day when the server offered none — a quote from before 069", () => {
    const old = quote({ standardDays: undefined as never, sameDaySlots: undefined as never })
    expect(needs(shapeOf(old), "standard")).toEqual({ slot: false, day: false })
  })
})

describe("feesFor — the fee is the method's, never the slot's or the day's", () => {
  it("sums the chosen method per delivery", () => {
    expect(feesFor(quote(), "standard")).toEqual({ sameDayCents: 0, standardCents: 600, totalCents: 600 })
    expect(feesFor(quote(), "same_day")).toEqual({ sameDayCents: 1100, standardCents: 0, totalCents: 1100 })
  })

  it("splits a mixed order into its same-day part and its standard part", () => {
    expect(feesFor(MIXED, "same_day")).toEqual({ sameDayCents: 1100, standardCents: 700, totalCents: 1800 })
    expect(feesFor(MIXED, "standard")).toEqual({ sameDayCents: 0, standardCents: 1300, totalCents: 1300 })
  })
})

describe("carrying a choice across a new quote", () => {
  it("keeps a slot that is still open", () => {
    expect(carrySlot(quote(), "slot-1")).toBe("slot-1")
  })

  it("⚠ drops a slot that has gone and selects NOTHING in its place", () => {
    const other = quote({ sameDaySlots: [{ ...SLOT, slotId: "slot-2" }] })
    expect(carrySlot(other, "slot-1")).toBeNull()
    expect(carrySlot(quote({ sameDaySlots: [] }), "slot-1")).toBeNull()
  })

  it("keeps a day that is still offered, and otherwise falls back to the earliest", () => {
    expect(carryDay(quote(), "2026-10-10")).toBe("2026-10-10")
    expect(carryDay(quote(), "2026-10-25")).toBe("2026-10-09")
    expect(carryDay(quote(), null)).toBe("2026-10-09")
    expect(carryDay(null, "2026-10-10")).toBeNull()
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

  it("a standard order holds nothing, so there is nothing to renew", () => {
    expect(holdLapsed(undefined, Date.now())).toBe(false)
    expect(holdLapsed(null, Date.now())).toBe(false)
    expect(holdLapsed("", Date.now())).toBe(false)
  })

  it("a malformed value is treated as no hold, never as a reason to block payment", () => {
    expect(holdLapsed("not-a-time", Date.now())).toBe(false)
  })
})
