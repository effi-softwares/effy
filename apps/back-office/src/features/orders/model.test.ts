import { describe, expect, it } from "vitest"

import {
  type OrderPackage,
  deliveryTypeText,
  nextActionFor,
  packageDeliveryText,
  PROMISE_FLAG_LABEL,
  promiseFlagsFor,
  promiseTextFor,
  journeyOf,
  journeySteps,
} from "./model"

const pkg = (over: Partial<OrderPackage> = {}): OrderPackage => ({
  statusView: null,
  collect: null,
  deliver: null,
  fulfillmentId: "f1",
  packageCode: "7K3Q9M",
  shopId: "s1",
  shopName: "Shop One",
  status: "collected",
  itemCount: 2,
  subtotalAmount: "20.00",
  deliveredBy: "courier",
  consignment: null,
  dueOut: null,
  late: false,
  deliveryMethod: "standard",
  handoff: null,
  arrival: null,
  promisedDate: null,
  window: null,
  overCapacity: false,
  handoverDueOn: null,
  atRisk: false,
  onTime: null,
  milestones: [],
  ...over,
})

const handoff = (reference: string | null = null) => ({
  reference,
  carrierName: null,
  handedOverAt: "2026-08-26T01:00:00.000Z",
  recordedBySub: "staff-1",
  note: null,
})

const arrival = () => ({
  arrivedAt: "2026-08-26T05:00:00.000Z",
  source: "staff_recorded" as const,
  recordedBySub: "staff-1",
  note: null,
})

describe("nextActionFor - which control the operator is offered", () => {
  it("offers a handover on a collected standard package", () => {
    expect(nextActionFor(pkg())).toBe("handoff")
  })

  it("078 - offers nothing on a standard package that was sold a window: Effy delivers it", () => {
    const window = { startAt: "2026-10-09T16:00:00+11:00", endAt: "2026-10-09T18:00:00+11:00" }
    expect(nextActionFor(pkg({ deliveredBy: "effy", promisedDate: "2026-10-09", window }))).toBe("none")
    expect(promiseTextFor(pkg({ promisedDate: "2026-10-09", window }))).toBe("Fri 9 Oct, 4 pm – 6 pm")
  })

  it("079 - follows `deliveredBy`, not the method or the window", () => {
    const window = { startAt: "2026-10-09T16:00:00+11:00", endAt: "2026-10-09T18:00:00+11:00" }
    expect(nextActionFor(pkg({ deliveredBy: "courier", window }))).toBe("handoff")
    expect(nextActionFor(pkg({ deliveredBy: "courier", deliveryMethod: "same_day", window }))).toBe("handoff")
    expect(nextActionFor(pkg({ deliveredBy: "effy", deliveryMethod: "standard", window: null }))).toBe("none")
  })

  it("079 - a package row says who delivers it, and the customer's word only where Effy does", () => {
    expect(packageDeliveryText(pkg({ deliveredBy: "courier" }))).toBe("Courier delivery")
    expect(packageDeliveryText(pkg({ deliveredBy: "effy", deliveryMethod: "same_day" }))).toBe(
      "Delivered by Effy · Same-day",
    )
    expect(packageDeliveryText(pkg({ deliveredBy: "effy", deliveryMethod: "standard" }))).toBe(
      "Delivered by Effy · Standard",
    )
    expect(packageDeliveryText(pkg({ deliveredBy: "effy", deliveryMethod: null }))).toBe("Delivered by Effy")
  })

  it("079 - an order's delivery type, in the customer's two names", () => {
    expect(deliveryTypeText("effy")).toBe("Delivered by Effy")
    expect(deliveryTypeText("courier")).toBe("Courier delivery")
  })

  it("offers an arrival once the handover is recorded", () => {
    expect(nextActionFor(pkg({ handoff: handoff() }))).toBe("arrival")
  })

  it("treats a handover with no carrier reference as complete", () => {
    expect(nextActionFor(pkg({ handoff: handoff(null) }))).toBe("arrival")
    expect(nextActionFor(pkg({ handoff: handoff("ABC123") }))).toBe("arrival")
  })

  it("offers nothing once the package has arrived", () => {
    expect(nextActionFor(pkg({ handoff: handoff(), arrival: arrival() }))).toBe("none")
  })

  it("offers no handover on a same-day package", () => {
    expect(nextActionFor(pkg({ deliveredBy: "effy", deliveryMethod: "same_day" }))).toBe("none")
  })

  it("offers nothing while the package is still at its shop", () => {
    for (const status of ["pending", "received", "picking", "ready_for_pickup"]) {
      expect(nextActionFor(pkg({ status }))).toBe("none")
    }
  })
})

describe("069 - what a package was promised", () => {
  it("says a standard package's day, and a same-day package's day and window", () => {
    expect(promiseTextFor(pkg({ promisedDate: "2026-10-13" }))).toBe("Tue 13 Oct")
    expect(
      promiseTextFor(
        pkg({
          deliveryMethod: "same_day",
          promisedDate: "2026-10-08",
          window: { startAt: "2026-10-08T17:00:00+11:00", endAt: "2026-10-08T19:00:00+11:00" },
        }),
      ),
    ).toBe("Thu 8 Oct, 5 pm – 7 pm")
  })

  it("⚠ says NOTHING for an order promised nothing - not a dash, not 'unknown'", () => {
    expect(promiseTextFor(pkg())).toBeNull()
    expect(promiseFlagsFor(pkg())).toEqual([])
  })

  it("flags what staff should notice, and only that", () => {
    expect(promiseFlagsFor(pkg({ promisedDate: "2026-10-13", atRisk: true }))).toEqual(["at_risk"])
    expect(promiseFlagsFor(pkg({ promisedDate: "2026-10-13", onTime: false }))).toEqual(["late"])
    expect(promiseFlagsFor(pkg({ promisedDate: "2026-10-13", onTime: true }))).toEqual(["on_time"])
    expect(promiseFlagsFor(pkg({ promisedDate: "2026-10-08", overCapacity: true }))).toEqual(["over_capacity"])
    // Not yet arrived: no verdict either way.
    expect(promiseFlagsFor(pkg({ promisedDate: "2026-10-13", onTime: null }))).toEqual([])
  })

  it("has wording for every flag, and never the raw key", () => {
    for (const [key, label] of Object.entries(PROMISE_FLAG_LABEL)) {
      expect(label, key).toBeTruthy()
      expect(label).not.toMatch(/_/)
    }
  })
})

describe("a package's journey", () => {
  const view = (status: string, detail: string | null = null) =>
    ({ status, word: status, detail, driverName: null }) as OrderPackage["statusView"]
  const ms = (...steps: [string, string][]) => steps.map(([status, at]) => ({ status, at })) as OrderPackage["milestones"]

  it("walks an Effy driver's steps, a courier's via the hub, and one collected from the shop", () => {
    expect(journeySteps({ deliveredBy: "effy" }, null)).toEqual(["preparing", "ready", "with_driver", "at_hub", "out_for_delivery", "delivered"])
    expect(journeySteps({ deliveredBy: "courier" }, "hub")).toEqual(["preparing", "ready", "with_driver", "at_hub", "with_carrier", "delivered"])
    expect(journeySteps({ deliveredBy: "courier" }, "supplier")).toEqual(["preparing", "ready", "with_carrier", "delivered"])
  })

  it("marks the steps done, the one it is at, and when each was reached", () => {
    const j = journeyOf(
      pkg({ deliveredBy: "effy", statusView: view("at_hub"), milestones: ms(["preparing", "t0"], ["ready", "t1"], ["with_driver", "t2"], ["at_hub", "t3"]) }),
      null,
    )
    expect(j.map((s) => s.state)).toEqual(["done", "done", "done", "current", "todo", "todo"])
    expect(j.map((s) => s.at)).toEqual(["t0", "t1", "t2", "t3", null, null])
  })

  it("finishes on delivered: its last step is done, not current", () => {
    const j = journeyOf(pkg({ deliveredBy: "effy", statusView: view("delivered"), milestones: ms(["delivered", "t9"]) }), null)
    expect(j.at(-1)).toMatchObject({ state: "done", at: "t9" })
  })

  it("puts a problem on the step after the last one reached, in its own words", () => {
    const j = journeyOf(
      pkg({ deliveredBy: "effy", statusView: view("problem", "Not checked in at the hub"), milestones: ms(["preparing", "t0"], ["ready", "t1"], ["with_driver", "t2"]) }),
      null,
    )
    expect(j.map((s) => s.state)).toEqual(["done", "done", "done", "problem", "todo", "todo"])
    expect(j[3]!.note).toBe("Not checked in at the hub")
  })

  it("never shows a time for a step the package has not reached (a reopened package's old \"ready\")", () => {
    const j = journeyOf(pkg({ deliveredBy: "effy", statusView: view("preparing"), milestones: ms(["preparing", "t0"], ["ready", "t1"]) }), null)
    expect(j[0]).toMatchObject({ state: "current", at: "t0" })
    expect(j[1]).toMatchObject({ state: "todo", at: null })
  })
})
