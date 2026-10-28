import { describe, expect, it } from "vitest"

import { productsList } from "./model"

const SHOP = "0f0e0d0c-0b0a-4908-8706-050403020100"

describe("productsList", () => {
  it("keeps what it understands", () => {
    expect(
      productsList.validateSearch({
        q: "milk",
        shopId: SHOP,
        state: "held",
        storage: "chilled",
        margin: "not_set",
        missingDetails: "true",
        lowStock: true,
        sort: "price",
        dir: "desc",
        page: "3",
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
      dir: "desc",
      page: 3,
    })
  })

  it("drops anything else, so an old or mangled link still opens the list", () => {
    expect(
      productsList.validateSearch({
        q: " ",
        shopId: "x",
        state: "all",
        storage: "warm",
        margin: "maybe",
        lowStock: "no",
        sort: "updated",
        dir: "up",
        cursor: "Mg",
      }),
    ).toEqual({})
  })

  it("asks the server for the page, the sort and every filter", () => {
    const view = { ...productsList.initial(), q: "a b", filters: { state: "held" as const, lowStock: true } }
    expect(productsList.toQuery(view).toString()).toBe("q=a+b&sort=updated&dir=desc&pageSize=25&page=1&state=held&lowStock=true")
  })
})
