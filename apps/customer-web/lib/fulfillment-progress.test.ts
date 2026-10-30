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

/** The order's stage is derived on the server (`stageFor`) and tested there; only the shortfall flattening is the client's. */
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
   * The disclosure rule. A flat list is not a stylistic choice: grouping the items
   * by portion - or reporting how many portions there were - would tell the customer their order was
   * split and into how many parts, which is exactly the fulfilment structure Effy's single-brand model
   * hides. The output shape must carry no count, index, or grouping.
   */
  it("exposes no portion count, index, or grouping", () => {
    const got = shortfallsFrom([
      portion("delivered", [{ productName: "Milk", quantity: 1 }]),
      portion("delivered", [{ productName: "Bread", quantity: 2 }]),
      portion("delivered", [{ productName: "Eggs", quantity: 1 }]),
    ])
    // A flat array of items and nothing else - no wrapper object that could carry a count.
    expect(Array.isArray(got)).toBe(true)
    expect(got).toHaveLength(3)
    for (const s of got) {
      expect(Object.keys(s).sort()).toEqual(["productName", "quantity"])
    }
    // The number of portions (3) must not be recoverable from the output - three portions here happen
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
