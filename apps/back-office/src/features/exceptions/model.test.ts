import { describe, expect, it } from "vitest"

import type { DeliveryExceptionDTO } from "@effy/shared-types"

import { canResolveExceptions } from "./access"
import { locationLabel, reasonLabel } from "./model"

const row = (over: Partial<DeliveryExceptionDTO> = {}): DeliveryExceptionDTO => ({
  exceptionId: "e1",
  stopId: "s1",
  orderNumber: "EFY-1",
  reason: "nobody_home",
  note: null,
  driverId: "d1",
  driverName: "Driver",
  destinationSuburb: "Richmond",
  failedAt: "2026-09-21T10:00:00.000Z",
  resolvedAt: null,
  packageLocation: "with_driver",
  roundId: "r1",
  returnedAt: null,
  ...over,
})

describe("reason labels", () => {
  it("renders words a person can act on, not enum values", () => {
    expect(reasonLabel("customer_refused")).toBe("Customer refused")
    expect(reasonLabel("access_blocked")).toBe("Access blocked")
  })

  it("falls back to the raw value rather than rendering nothing", () => {
    expect(reasonLabel("delivered_to_neighbour" as never)).toBe("delivered_to_neighbour")
  })
})

describe("⚠ FR-020 - where the package actually is", () => {
  it("distinguishes a van from the hub", () => {
    expect(locationLabel(row({ packageLocation: "with_driver" }))).toBe(`With ${row().driverName} - to return`)
    expect(locationLabel(row({ packageLocation: "at_hub" }))).toBe("At hub")
    // A recorded return says so.
    expect(locationLabel(row({ packageLocation: "at_hub", returnedAt: "2026-10-16T05:00:00.000Z" }))).toMatch(
      /^Returned /,
    )
  })
})

describe("who may close an exception (FR-021)", () => {
  it("admin and manager may", () => {
    expect(canResolveExceptions(["admin"])).toBe(true)
    expect(canResolveExceptions(["manager"])).toBe(true)
  })

  it("⚠ csa may NOT - while still reading every row", () => {
    expect(canResolveExceptions(["csa"])).toBe(false)
  })

  it("no role at all may not", () => {
    expect(canResolveExceptions([])).toBe(false)
  })

  it("a csa who is also a manager may", () => {
    expect(canResolveExceptions(["csa", "manager"])).toBe(true)
  })
})
