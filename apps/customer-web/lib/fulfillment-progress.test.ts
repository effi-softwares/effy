import { describe, expect, it } from "vitest"

import type { OrderFulfillmentDTO } from "@effy/shared-types"

import { summarizeFulfillment } from "./fulfillment-progress"

const portion = (
  status: OrderFulfillmentDTO["status"],
  unavailableItems?: OrderFulfillmentDTO["unavailableItems"],
): OrderFulfillmentDTO => ({
  status,
  itemCount: 2,
  subtotalAmount: "20.00",
  ...(unavailableItems ? { unavailableItems } : {}),
})

describe("summarizeFulfillment", () => {
  it("returns null when there is nothing to report", () => {
    expect(summarizeFulfillment([])).toBeNull()
  })

  it("reports confirmed while every portion is still untouched", () => {
    expect(summarizeFulfillment([portion("pending"), portion("received")])?.stage).toBe("confirmed")
  })

  it("reports preparing once any portion is being picked", () => {
    expect(summarizeFulfillment([portion("pending"), portion("picking")])?.stage).toBe("preparing")
  })

  it("reports ready only when every portion is terminal", () => {
    expect(summarizeFulfillment([portion("ready_for_pickup"), portion("collected")])?.stage).toBe(
      "ready",
    )
  })

  // US5 scenario 3 / SC-009: a partially-ready multi-shop order must not claim completion. Saying
  // "ready" while a portion is still being picked would be misleading about what is on its way.
  it("does not claim ready while one portion is still outstanding", () => {
    expect(summarizeFulfillment([portion("ready_for_pickup"), portion("picking")])?.stage).toBe(
      "preparing",
    )
  })

  // The privacy guarantee: nothing the customer receives may imply HOW MANY places are involved.
  // A count, an index, or a per-portion grouping would disclose the fan-out as surely as a name.
  it("exposes no portion count, index, or grouping", () => {
    const result = summarizeFulfillment([
      portion("ready_for_pickup", [{ productName: "Spaghetti", quantity: 1 }]),
      portion("ready_for_pickup", [{ productName: "Olive Oil", quantity: 2 }]),
      portion("ready_for_pickup"),
    ])

    expect(Object.keys(result ?? {}).sort()).toEqual(["shortfalls", "stage"])
    // Flattened, not grouped — the shape itself must not reveal that three portions existed.
    expect(result?.shortfalls).toEqual([
      { productName: "Spaghetti", quantity: 1 },
      { productName: "Olive Oil", quantity: 2 },
    ])
    expect(JSON.stringify(result)).not.toMatch(/shop|portion|fulfillmentId/i)
  })

  it("flattens shortfalls across portions", () => {
    const result = summarizeFulfillment([
      portion("ready_for_pickup", [{ productName: "Rice", quantity: 1 }]),
      portion("collected", [{ productName: "Oats", quantity: 3 }]),
    ])
    expect(result?.shortfalls).toHaveLength(2)
  })

  // The backend omits shortfalls on non-terminal portions, so a flag later undone never arrives.
  // This asserts the client does not invent one either.
  it("reports no shortfall when the backend sent none", () => {
    expect(summarizeFulfillment([portion("picking"), portion("received")])?.shortfalls).toEqual([])
  })
})
