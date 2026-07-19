import { describe, expect, it } from "vitest"

import { addLine, cartCount, mergePayload, removeLine, setLineQty, type GuestCartLine } from "./cart-store"

const line = (productId: string, quantity: number): GuestCartLine => ({
  productId,
  name: productId,
  imageUrl: null,
  unitPriceAmount: "5.00",
  currency: "AUD",
  quantity,
})

describe("addLine", () => {
  it("adds a new line", () => {
    expect(addLine([], line("a", 2))).toHaveLength(1)
  })

  it("merges quantity for an existing product", () => {
    const result = addLine([line("a", 2)], line("a", 3))
    expect(result).toHaveLength(1)
    expect(result[0].quantity).toBe(5)
  })

  it("clamps merged quantity at 99", () => {
    expect(addLine([line("a", 90)], line("a", 20))[0].quantity).toBe(99)
  })

  it("clamps a new line to at least 1", () => {
    expect(addLine([], line("a", 0))[0].quantity).toBe(1)
  })
})

describe("setLineQty", () => {
  it("updates the quantity", () => {
    expect(setLineQty([line("a", 1)], "a", 4)[0].quantity).toBe(4)
  })
  it("removes the line at quantity 0", () => {
    expect(setLineQty([line("a", 1)], "a", 0)).toHaveLength(0)
  })
})

describe("removeLine", () => {
  it("drops the matching product", () => {
    expect(removeLine([line("a", 1), line("b", 1)], "a")).toEqual([line("b", 1)])
  })
})

describe("cartCount", () => {
  it("sums quantities", () => {
    expect(cartCount([line("a", 2), line("b", 3)])).toBe(5)
  })
})

describe("mergePayload", () => {
  it("projects to productId + quantity", () => {
    expect(mergePayload([line("a", 2)])).toEqual([{ productId: "a", quantity: 2 }])
  })
})
