import { describe, expect, it } from "vitest"

import { completionState, mayClearCart } from "./state"

/**
 * ⚠ THE DEFECT THIS PINS. The order row is created at INTENT time, so it exists from the moment the
 * shopper reaches the payment step — before any money moves — and `GET /v1/orders/{id}` has no status
 * filter. The page branched on whether the order could be FETCHED rather than on whether it was PAID,
 * so a shopper who abandoned at Klarna, Zip, Afterpay or a 3DS challenge came back to "Thank you …
 * Total paid" AND an emptied basket, while the abandoned copy promised the basket was still there.
 */
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

  // ⚠ The hint can be edited, replayed or stale — it must never override what the platform says.
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
  // ⚠ Nothing was charged in any state but the first, so the basket is how a shopper tries again.
  it("empties the basket only for a paid order", () => {
    expect(mayClearCart("receipt")).toBe(true)
    expect(mayClearCart("abandoned")).toBe(false)
    expect(mayClearCart("confirming")).toBe(false)
  })
})
