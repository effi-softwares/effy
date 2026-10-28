import { describe, expect, it } from "vitest"

import { encodeProductListQuery } from "./repo"
import type { ProductListParams } from "./model"

describe("encodeProductListQuery", () => {
  it("always sends page + pageSize", () => {
    const qs = new URLSearchParams(encodeProductListQuery({ page: 2, pageSize: 20 }))
    expect(qs.get("page")).toBe("2")
    expect(qs.get("pageSize")).toBe("20")
  })

  it("omits every empty/undefined filter", () => {
    const qs = encodeProductListQuery({ page: 1, pageSize: 20, q: "  ", priceMin: "" })
    expect(qs).toBe("page=1&pageSize=20")
  })

  it("includes and trims every supplied filter", () => {
    const params: ProductListParams = {
      page: 1,
      pageSize: 20,
      q: "  latte ",
      missing: true,
      category: "c1",
      section: "s1",
      status: "active",
      priceMin: "1.00",
      priceMax: "9.99",
      sort: "price",
      order: "asc",
    }
    const qs = new URLSearchParams(encodeProductListQuery(params))
    expect(qs.get("q")).toBe("latte")
    expect(qs.get("missing")).toBe("true")
    expect(qs.get("category")).toBe("c1")
    expect(qs.get("section")).toBe("s1")
    expect(qs.get("status")).toBe("active")
    expect(qs.get("priceMin")).toBe("1.00")
    expect(qs.get("priceMax")).toBe("9.99")
    expect(qs.get("sort")).toBe("price")
    expect(qs.get("dir")).toBe("asc")
  })
})
