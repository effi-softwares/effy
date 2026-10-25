import { describe, expect, it } from "vitest"

import { canManageDrivers } from "./access"

describe("canManageDrivers — the console's mirror of the backend gate", () => {
  it("permits an administrator and a manager", () => {
    expect(canManageDrivers(["admin"])).toBe(true)
    expect(canManageDrivers(["manager"])).toBe(true)
    expect(canManageDrivers(["manager", "csa"])).toBe(true)
  })

  it("⚠ refuses a csa — who READS everything and CHANGES nothing", () => {
    expect(canManageDrivers(["csa"])).toBe(false)
  })

  it("refuses a role-less account, and refuses an empty list", () => {
    expect(canManageDrivers([])).toBe(false)
  })
})
