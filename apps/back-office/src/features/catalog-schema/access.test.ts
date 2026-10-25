import { describe, expect, it } from "vitest"

import { canManageCatalog } from "./access"

describe("canManageCatalog", () => {
  it("is true when admin or manager is present", () => {
    expect(canManageCatalog(["admin"])).toBe(true)
    expect(canManageCatalog(["manager"])).toBe(true)
    expect(canManageCatalog(["csa", "manager"])).toBe(true)
  })

  it("is false for csa or role-less accounts", () => {
    expect(canManageCatalog(["csa"])).toBe(false)
    expect(canManageCatalog([])).toBe(false)
  })
})
