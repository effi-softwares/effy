import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { validateTours } from "@effy/web-kit/tour"
import { checkRoleFiltering, checkToursAgainstSpec, readTourInventory } from "@effy/web-kit/tour/testing"

import { SHOP_TOURS } from "./tours"

/**
 * 106 FR-016/FR-017: the tours' words are the spec's Tour Inventory, word for word, within the limits, with the roles
 * its "Shown when" column names. Change a word in one place and this fails until it is changed in both.
 */

const SPEC = resolve(__dirname, "../../../../../specs/106-guided-tours/spec.md")

const CODE_TO_KEY: Record<string, string> = {
  W: "welcome",
  T: "today",
  OQ: "orders-queue",
  OT: "orders-table",
  OD: "order",
  C: "catalog",
  N: "product-new",
  P: "product",
  A: "availability",
  I: "insights",
  IS: "insights-sales",
  IP: "insights-products",
  IK: "insights-stock",
  IV: "insights-service",
  IC: "insights-chart",
  TM: "team",
  NS: "settings-notifications",
  NF: "notifications",
  PS: "settings-printing",
}

/** The spec's marks, as role keys. "Manager, and something is refundable" reads as "Manager". */
const ROLE_MARKS = { Manager: ["shop_manager"] } as const

describe("the shop console's tours (106)", () => {
  it("found the spec's inventory (the test must not pass vacuously)", () => {
    expect(readTourInventory(SPEC).size).toBe(19)
  })

  it("are within the limits: titles ≤ 40, texts ≤ 220, ≤ 12 steps, unique keys", () => {
    expect(validateTours(SHOP_TOURS)).toEqual([])
  })

  it("say exactly what the spec says, step for step, with its roles", () => {
    expect(
      checkToursAgainstSpec({ specPath: SPEC, codeToKey: CODE_TO_KEY, tours: SHOP_TOURS, roleMarks: ROLE_MARKS }),
    ).toEqual([])
  })

  it("never show staff a step the spec keeps for managers", () => {
    expect(
      checkRoleFiltering({
        specPath: SPEC,
        codeToKey: CODE_TO_KEY,
        tours: SHOP_TOURS,
        roleMarks: ROLE_MARKS,
        role: "shop_staff",
      }),
    ).toEqual([])
  })
})
