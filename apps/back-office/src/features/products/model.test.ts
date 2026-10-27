import { describe, expect, it } from "vitest"

import { clearFilters, hasFilters, parseProductSearch, toQueryString } from "./model"

const SHOP = "0f0e0d0c-0b0a-4908-8706-050403020100"

describe("parseProductSearch", () => {
  it("keeps what it understands", () => {
    expect(
      parseProductSearch({
        q: "  milk ",
        shopId: SHOP,
        state: "held",
        storage: "chilled",
        margin: "not_set",
        missingDetails: "true",
        lowStock: true,
        sort: "price",
        dir: "asc",
      }),
    ).toEqual({
      q: "milk",
      shopId: SHOP,
      state: "held",
      storage: "chilled",
      margin: "not_set",
      missingDetails: true,
      lowStock: true,
      sort: "price",
      dir: "asc",
    })
  })

  it("drops anything else, so an old or mangled link still opens the list", () => {
    expect(
      parseProductSearch({
        q: " ",
        shopId: "x",
        state: "all",
        storage: "warm",
        margin: "maybe",
        lowStock: "no",
        sort: "updated",
        dir: "up",
      }),
    ).toEqual({})
  })
})

describe("toQueryString", () => {
  it("writes the view and the cursor", () => {
    expect(toQueryString({ q: "a b", state: "held" }, "Mg")).toBe("q=a+b&state=held&cursor=Mg")
    expect(toQueryString({}, null)).toBe("")
  })
})

describe("filters", () => {
  it("knows when anything beyond the tab is set, and clears it", () => {
    expect(hasFilters({ state: "held", sort: "name" })).toBe(false)
    expect(hasFilters({ lowStock: true })).toBe(true)
    expect(clearFilters({ q: "x", shopId: SHOP, state: "held", sort: "name" })).toEqual({
      state: "held",
      sort: "name",
      dir: undefined,
    })
  })
})
