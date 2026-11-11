import { describe, expect, it } from "vitest"

import { linkOf, toCustomerDestination } from "./DestinationPicker"

describe("a storefront link as a customer destination (112 R10)", () => {
  it("maps search, sale, an aisle (by its key) and a product", () => {
    expect(toCustomerDestination({ kind: "search", category: null, product: null })).toEqual({ kind: "search" })
    expect(toCustomerDestination({ kind: "sale", category: null, product: null })).toEqual({ kind: "sale" })
    expect(
      toCustomerDestination({
        kind: "category",
        category: { id: "c1", name: "Food › Fruit", key: "fruit" },
        product: null,
      }),
    ).toEqual({ kind: "aisle", aisleKey: "fruit", title: "Fruit" })
    expect(toCustomerDestination({ kind: "product", category: null, product: { id: "p1", name: "Apples" } })).toEqual({
      kind: "product",
      productId: "p1",
    })
  })

  it("is null until an aisle or product is chosen", () => {
    expect(toCustomerDestination({ kind: "category", category: null, product: null })).toBeNull()
    expect(toCustomerDestination({ kind: "product", category: null, product: null })).toBeNull()
  })

  it("reads a saved aisle back into the picker", () => {
    expect(linkOf({ kind: "aisle", aisleKey: "fruit", title: "Fruit" })).toEqual({
      kind: "category",
      category: { id: "fruit", name: "Fruit", key: "fruit" },
      product: null,
    })
  })
})
