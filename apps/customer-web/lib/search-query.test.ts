import { describe, expect, it } from "vitest"

import { facetsQuery, productsQuery, rangeValue, readRefinement } from "./search-query"

const from = (search: string) => readRefinement(new URLSearchParams(search))

describe("a listing's query", () => {
  it("reads every refinement the address carries", () => {
    expect(from("q=milk&category=dairy&saleOnly=true&minPrice=2&maxPrice=9&sort=price_asc&brand=A&brand=B&attr.diet=vegan&attr.diet=kosher")).toEqual({
      q: "milk",
      category: "dairy",
      saleOnly: true,
      minPrice: "2",
      maxPrice: "9",
      sort: "price_asc",
      brands: ["A", "B"],
      attributes: { diet: ["vegan", "kosher"] },
      ranges: {},
    })
  })

  it("101 — reads and writes number ranges, either end open, and drops a malformed one", () => {
    const r = from("range.net_weight=0.5..2&range.age=..12&range.bad=abc")
    expect(r.ranges).toEqual({ net_weight: { min: "0.5", max: "2" }, age: { min: "", max: "12" } })
    expect(facetsQuery(r)).toBe("range.net_weight=0.5..2&range.age=..12")
  })

  it("an address with nothing on it is the newest of everything", () => {
    expect(productsQuery(from(""))).toBe("sort=newest&limit=24")
    expect(facetsQuery(from(""))).toBe("")
  })

  it("names the aisle the way the backend does, and pages with a cursor", () => {
    expect(productsQuery(from("category=dairy"))).toBe("categoryKey=dairy&sort=newest&limit=24")
    expect(productsQuery(from("category=dairy"), "abc")).toBe("categoryKey=dairy&sort=newest&cursor=abc&limit=24")
  })

  it("the counts take the filters and neither the order nor the page", () => {
    expect(facetsQuery(from("q=%20milk%20&sort=price_desc&brand=A"))).toBe("q=milk&brand=A")
  })

  // The browser shows the server's first page only when both built the same string.
  it("is the same string however the address ordered its parameters", () => {
    expect(productsQuery(from("brand=A&category=dairy&q=milk"))).toBe(productsQuery(from("q=milk&category=dairy&brand=A")))
  })

  it("an emptied range is no range", () => {
    expect(rangeValue(" ", "")).toBeNull()
    expect(rangeValue("1", "")).toBe("1..")
  })
})
