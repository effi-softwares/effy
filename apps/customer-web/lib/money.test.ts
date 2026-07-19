import { describe, expect, it } from "vitest"

import { badgeLabel, formatMoney, isDiscounted } from "./money"
import { computeRecentlyViewed } from "./recently-viewed"

describe("formatMoney", () => {
  it("formats a decimal string as AUD currency", () => {
    expect(formatMoney("5", "AUD")).toBe("$5.00")
    expect(formatMoney("12.5", "AUD")).toBe("$12.50")
  })

  it("falls back gracefully for a non-numeric amount", () => {
    expect(formatMoney("abc", "AUD")).toBe("AUD abc")
  })
})

describe("isDiscounted", () => {
  it("is true only when compare-at exceeds the price", () => {
    expect(isDiscounted("5.00", "8.00")).toBe(true)
    expect(isDiscounted("5.00", "5.00")).toBe(false)
    expect(isDiscounted("5.00", "3.00")).toBe(false)
    expect(isDiscounted("5.00", null)).toBe(false)
  })
})

describe("badgeLabel", () => {
  it("maps known badges and passes through unknown", () => {
    expect(badgeLabel("on_sale")).toBe("Sale")
    expect(badgeLabel("new")).toBe("New")
    expect(badgeLabel("mystery")).toBe("mystery")
  })
})

describe("computeRecentlyViewed", () => {
  it("prepends most-recent-first and de-duplicates", () => {
    expect(computeRecentlyViewed(["a", "b"], "c")).toEqual(["c", "a", "b"])
    expect(computeRecentlyViewed(["a", "b", "c"], "b")).toEqual(["b", "a", "c"])
  })

  it("caps the list at 20", () => {
    const twenty = Array.from({ length: 20 }, (_, i) => `p${i}`)
    const result = computeRecentlyViewed(twenty, "new")
    expect(result).toHaveLength(20)
    expect(result[0]).toBe("new")
    expect(result).not.toContain("p19")
  })
})
