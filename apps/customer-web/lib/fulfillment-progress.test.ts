import { describe, expect, it } from "vitest"

import type { OrderFulfillmentDTO } from "@effy/shared-types"

import { shortfallsFrom } from "./fulfillment-progress"

const portion = (
  status: OrderFulfillmentDTO["status"],
  unavailableItems?: OrderFulfillmentDTO["unavailableItems"],
): OrderFulfillmentDTO => ({
  status,
  itemCount: 2,
  subtotalAmount: "20.00",
  ...(unavailableItems ? { unavailableItems } : {}),
})

/**
 * ⚠ THE STAGE CASES THAT USED TO LIVE HERE ARE GONE, DELIBERATELY (052 FR-008).
 *
 * They tested a client-side four-value rollup that duplicated, in TypeScript, the rule the server now
 * applies in `apis/core-api/internal/features/orders/stage.go`. That rule is still tested — harder,
 * with its own negative proof — in `stage_test.go`. Keeping a second copy here would mean two
 * implementations of one rule with two test suites agreeing with each other and possibly with nothing
 * else, which is exactly 029's and 033's failure mode.
 *
 * What remains is the part that is genuinely the client's: flattening shortfalls without leaking the
 * fan-out.
 */
describe("shortfallsFrom", () => {
  it("returns nothing when there are no portions", () => {
    expect(shortfallsFrom([])).toEqual([])
  })

  it("reports no shortfall when the backend sent none", () => {
    expect(shortfallsFrom([portion("picking"), portion("received")])).toEqual([])
  })

  it("flattens shortfalls across portions", () => {
    const got = shortfallsFrom([
      portion("delivered", [{ productName: "Milk", quantity: 1 }]),
      portion("collected", [{ productName: "Bread", quantity: 2 }]),
    ])
    expect(got).toEqual([
      { productName: "Milk", quantity: 1 },
      { productName: "Bread", quantity: 2 },
    ])
  })

  /**
   * ⚠ THE DISCLOSURE RULE (FR-018, SC-009). A flat list is not a stylistic choice: grouping the items
   * by portion — or reporting how many portions there were — would tell the customer their order was
   * split and into how many parts, which is exactly the fulfilment structure Effy's single-brand model
   * hides. The output shape must carry no count, index, or grouping.
   */
  it("exposes no portion count, index, or grouping", () => {
    const got = shortfallsFrom([
      portion("delivered", [{ productName: "Milk", quantity: 1 }]),
      portion("delivered", [{ productName: "Bread", quantity: 2 }]),
      portion("delivered", [{ productName: "Eggs", quantity: 1 }]),
    ])
    // A flat array of items and nothing else — no wrapper object that could carry a count.
    expect(Array.isArray(got)).toBe(true)
    expect(got).toHaveLength(3)
    for (const s of got) {
      expect(Object.keys(s).sort()).toEqual(["productName", "quantity"])
    }
    // The number of PORTIONS (3) must not be recoverable from the output — three portions here happen
    // to yield three items, so prove it with an uneven split too.
    const uneven = shortfallsFrom([
      portion("delivered", [
        { productName: "Milk", quantity: 1 },
        { productName: "Bread", quantity: 1 },
      ]),
      portion("delivered", [{ productName: "Eggs", quantity: 1 }]),
    ])
    expect(uneven).toHaveLength(3)
  })
})
