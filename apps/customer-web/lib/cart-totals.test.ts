import { describe, expect, it } from "vitest"

import type { GuestCartLine } from "./cart-store"
import { computeCartTotals, formatCents, parseCents } from "./cart-totals"

const line = (unit: string, qty: number): GuestCartLine => ({
  productId: unit + qty,
  name: "x",
  imageUrl: null,
  unitPriceAmount: unit,
  currency: "AUD",
  quantity: qty,
})

describe("cents helpers", () => {
  it("round-trips", () => {
    expect(parseCents("5.00")).toBe(500)
    expect(parseCents("12.5")).toBe(1250)
    expect(formatCents(500)).toBe("5.00")
    expect(formatCents(99)).toBe("0.99")
  })
})

describe("computeCartTotals", () => {
  it("sums lines and adds the flat delivery fee", () => {
    const totals = computeCartTotals([line("5.00", 2), line("3.00", 1)])
    expect(totals.itemSubtotal).toBe("13.00")
    expect(totals.deliveryFee).toBe("5.00")
    expect(totals.grandTotal).toBe("18.00")
  })

  it("charges no delivery fee for an empty cart", () => {
    const totals = computeCartTotals([])
    expect(totals.itemSubtotal).toBe("0.00")
    expect(totals.deliveryFee).toBe("0.00")
    expect(totals.grandTotal).toBe("0.00")
  })
})
