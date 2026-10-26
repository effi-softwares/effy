import { describe, expect, it } from "vitest"

import { productDetail as detail } from "./__tests__/product.fixture"
import { buildProductUpdate, diffScalarFields } from "./focusedEdit"

describe("buildProductUpdate", () => {
  it("always includes expectedUpdatedAt and only the changed subset", () => {
    const body = buildProductUpdate("2026-07-16T10:00:00Z", { name: "Long Black" })
    expect(body).toEqual({ expectedUpdatedAt: "2026-07-16T10:00:00Z", name: "Long Black" })
    // No other field leaks into the payload.
    expect(Object.keys(body).sort()).toEqual(["expectedUpdatedAt", "name"])
  })
})

describe("diffScalarFields", () => {
  it("returns only the fields whose value actually changed", () => {
    const changed = diffScalarFields(detail(), {
      name: "Flat White", // unchanged
      shortDescription: "Velvet espresso", // changed
      brand: "Effy Roastery", // unchanged
    })
    expect(changed).toEqual({ shortDescription: "Velvet espresso" })
  })

  it("treats '' vs null as a change and null vs null as unchanged", () => {
    // brand was "Effy Roastery" → cleared to null is a change
    expect(diffScalarFields(detail(), { brand: null })).toEqual({ brand: null })
    // longDescription was null → staying null is not a change
    expect(diffScalarFields(detail(), { longDescription: null })).toEqual({})
  })

  it("ignores keys that were not supplied", () => {
    expect(diffScalarFields(detail(), {})).toEqual({})
  })

  it("never carries category, facts or details: they have their own edits", () => {
    const changed = diffScalarFields(detail(), {
      name: "Long Black",
      ...({ primaryCategoryId: "c2", gstStatus: "taxable" } as object),
    })
    expect(changed).toEqual({ name: "Long Black" })
  })
})
