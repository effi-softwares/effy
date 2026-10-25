import { describe, expect, it } from "vitest"

import type { ProductDetail, ProductType } from "./model"
import { buildAttributeUpdate, buildProductUpdate, diffScalarFields, seedAttributeDraft } from "./focusedEdit"

function detail(over: Partial<ProductDetail> = {}): ProductDetail {
  return {
    id: "p1",
    shopId: "s1",
    productTypeId: "t1",
    typeName: "Prepared Food",
    primaryCategoryId: "c1",
    categoryName: "Coffee",
    name: "Flat White",
    brand: "Effy Roastery",
    currency: "AUD",
    shortDescription: "Silky espresso",
    longDescription: null,
    gstStatus: "gst_free",
    unitBasis: null,
    options: [],
    variants: [],
    status: "active",
    attributes: [],
    media: [],
    sections: [],
    missingMandatoryAttributes: [],
    createdAt: "2026-07-16T00:00:00Z",
    updatedAt: "2026-07-16T10:00:00Z",
    ...over,
  }
}

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

  it("captures a type + category change together", () => {
    const changed = diffScalarFields(detail(), {
      productTypeId: "t2",
      primaryCategoryId: "c1", // unchanged
    })
    expect(changed).toEqual({ productTypeId: "t2" })
  })
})

describe("buildAttributeUpdate", () => {
  const type: ProductType = {
    id: "t1",
    key: "food",
    name: "Food",
    description: null,
    status: "active",
    attributes: [
      {
        attributeId: "spice",
        key: "spice",
        name: "Spice",
        dataType: "single_select",
        unit: null,
        helpText: null,
        validation: null,
        allowedValues: [{ id: "1", value: "hot", label: "Hot", displayOrder: 0 }],
        isMandatory: false,
        displayOrder: 0,
        groupLabel: null,
      },
    ],
    createdAt: "",
    updatedAt: "",
  }

  it("carries the token plus the collected attribute inputs, nothing else", () => {
    const body = buildAttributeUpdate("2026-07-16T10:00:00Z", type, { spice: { text: "hot" } })
    expect(body).toEqual({
      expectedUpdatedAt: "2026-07-16T10:00:00Z",
      attributes: [{ attributeId: "spice", valueText: "hot" }],
    })
  })
})

describe("seedAttributeDraft", () => {
  it("maps each typed value back to the editor draft shape", () => {
    const d = detail({
      attributes: [
        {
          attributeId: "a-text",
          key: "origin",
          name: "Origin",
          dataType: "short_text",
          unit: null,
          valueText: "Kenya",
          valueNumber: null,
          valueBoolean: null,
          valueOptions: null,
        },
        {
          attributeId: "a-num",
          key: "weight",
          name: "Weight",
          dataType: "number",
          unit: "g",
          valueText: null,
          valueNumber: 250,
          valueBoolean: null,
          valueOptions: null,
        },
        {
          attributeId: "a-multi",
          key: "diet",
          name: "Diet",
          dataType: "multi_select",
          unit: null,
          valueText: null,
          valueNumber: null,
          valueBoolean: null,
          valueOptions: ["vegan"],
        },
      ],
    })
    expect(seedAttributeDraft(d)).toEqual({
      "a-text": { text: "Kenya" },
      "a-num": { number: "250" },
      "a-multi": { options: ["vegan"] },
    })
  })
})

describe("096 — GST status in a focused edit", () => {
  it("sends a changed GST status and omits an unchanged or unanswered one", () => {
    expect(diffScalarFields(detail({ gstStatus: "taxable" }), { gstStatus: "gst_free" })).toEqual({
      gstStatus: "gst_free",
    })
    expect(diffScalarFields(detail({ gstStatus: "gst_free" }), { gstStatus: "gst_free" })).toEqual({})
    expect(diffScalarFields(detail({ gstStatus: null }), { gstStatus: undefined })).toEqual({})
    expect(diffScalarFields(detail({ gstStatus: null }), { gstStatus: "taxable" })).toEqual({ gstStatus: "taxable" })
  })
})
