import { describe, expect, it } from "vitest"

import { completionState, mayClearCart } from "./state"

/** Only a paid order is a receipt and clears the basket; an order that exists but was not paid keeps it. */
describe("completion state", () => {
  it("is a receipt only when the order is actually paid", () => {
    expect(completionState({ status: "paid" })).toBe("receipt")
    expect(completionState({ paymentStatus: "succeeded" })).toBe("receipt")
  })

  it("is not a receipt for an order that exists but has not been paid", () => {
    expect(completionState({ status: "pending_payment" })).toBe("confirming")
  })

  it("says the payment was not completed when the provider reports a return from failure", () => {
    expect(completionState({ status: "pending_payment" }, "failed")).toBe("abandoned")
    expect(completionState({ status: "pending_payment" }, "canceled")).toBe("abandoned")
  })

  // The hint can be edited, replayed or stale - it must never override what the platform says.
  it("never lets the redirect hint contradict the platform", () => {
    expect(completionState({ status: "paid" }, "failed")).toBe("receipt")
    expect(completionState({ status: "pending_payment" }, "succeeded")).toBe("confirming")
  })

  it("has no receipt when the order could not be read at all", () => {
    expect(completionState(null)).toBe("confirming")
    expect(completionState(null, "canceled")).toBe("abandoned")
  })
})

describe("the cart rule", () => {
  // Nothing was charged in any state but the first, so the basket is how a shopper tries again.
  it("empties the basket only for a paid order", () => {
    expect(mayClearCart("receipt")).toBe(true)
    expect(mayClearCart("abandoned")).toBe(false)
    expect(mayClearCart("confirming")).toBe(false)
  })
})
