import { describe, expect, it } from "vitest"

import {
  formatAttributeValue, isStockDateName, missingDetails, recategorise, validateDetails, valueProblem,
} from "./product-form"
import type { CategoryFormRow, DetailInput } from "./taxonomy"

function row(over: Partial<CategoryFormRow> & Pick<CategoryFormRow, "attributeId" | "key" | "name" | "inputType">): CategoryFormRow {
  return {
    helpText: null, unitFamily: null, units: [], min: null, max: null, decimals: null, maxLength: null, values: [],
    level: "optional", section: "Details", position: 0, filterable: false, customerVisible: true,
    variesByVariant: false, variantOption: false, ...over,
  }
}

const allergens = row({
  attributeId: "a-allergens", key: "allergens", name: "Allergens", inputType: "multi_select", level: "required",
  variesByVariant: true, values: [{ id: "milk", label: "Milk" }, { id: "eggs", label: "Eggs" }],
})
const weight = row({
  attributeId: "a-weight", key: "weight", name: "Weight", inputType: "number", unitFamily: "mass", units: ["kg", "g"],
  min: "0", max: "50000", decimals: 2,
})
const ingredients = row({ attributeId: "a-ing", key: "ingredients", name: "Ingredients", inputType: "long_text", level: "recommended" })
const flavour = row({
  attributeId: "a-flavour", key: "flavour", name: "Flavour", inputType: "single_select", variesByVariant: true,
  variantOption: true, values: [{ id: "mango", label: "Mango" }, { id: "plain", label: "Plain" }],
})
const released = row({ attributeId: "a-date", key: "release_date", name: "Release date", inputType: "date" })
const rows = [allergens, weight, ingredients, flavour, released]
const two = [{ id: "v1", label: "Mango" }, { id: "v2", label: "Plain" }]

describe("validateDetails (101)", () => {
  it("accepts values that fit", () => {
    const details: DetailInput[] = [
      { attributeId: "a-allergens", value: { valueIds: ["milk"] } },
      { attributeId: "a-weight", value: { number: "1.5", unit: "kg" } },
      { attributeId: "a-ing", value: { text: "Milk, cultures" } },
      { attributeId: "a-date", value: { date: "2026-03-03" } },
    ]
    expect(validateDetails(rows, details, two)).toEqual([])
  })

  it("refuses the wrong shape, unit, limits, unknown values and unknown attributes", () => {
    const errors = validateDetails(rows, [
      { attributeId: "a-weight", value: { number: "60", unit: "kg" } },
      { attributeId: "a-allergens", value: { valueIds: ["gluten"] } },
      { attributeId: "a-date", value: { date: "2026-02-30" } },
      { attributeId: "nope", value: { text: "x" } },
    ], two)
    expect(errors.map((e) => e.field)).toEqual(["details.weight", "details.allergens", "details.release_date", "details.nope"])
    expect(valueProblem(weight, { number: "1.555", unit: "kg" })).toMatch(/2 decimal places/)
    expect(valueProblem(weight, { number: "1" })).toMatch(/Choose a unit/)
  })

  it("lets a detail differ by variant only when the attribute allows it and there are two variants", () => {
    const per: DetailInput = { attributeId: "a-allergens", perVariant: [{ variantId: "v1", value: { valueIds: ["milk"] } }] }
    expect(validateDetails(rows, [per], two)).toEqual([])
    expect(validateDetails(rows, [per], [two[0]!])[0]!.message).toMatch(/more than one variant/)
    const notVaries: DetailInput = { attributeId: "a-ing", perVariant: [{ variantId: "v1", value: { text: "x" } }] }
    expect(validateDetails(rows, [notVaries], two)[0]!.message).toMatch(/same for every variant/)
    const stranger: DetailInput = { attributeId: "a-allergens", perVariant: [{ variantId: "v9", value: { valueIds: ["milk"] } }] }
    expect(validateDetails(rows, [stranger], two)[0]!.field).toBe("details.allergens[v9]")
  })

  it("refuses a detail that is the product's variant option", () => {
    const errors = validateDetails(rows, [{ attributeId: "a-flavour", value: { valueIds: ["mango"] } }], two, {
      optionAttributeIds: ["a-flavour"],
    })
    expect(errors[0]!.message).toMatch(/set per variant by its option/)
  })
})

describe("missingDetails (101)", () => {
  it("names required details still empty, per variant where a detail differs", () => {
    expect(missingDetails(rows, [], two)).toEqual(["Allergens"])
    const per: DetailInput = { attributeId: "a-allergens", perVariant: [{ variantId: "v1", value: { valueIds: ["milk"] } }] }
    expect(missingDetails(rows, [per], two)).toEqual(["Allergens (Plain)"])
    expect(missingDetails(rows, [{ attributeId: "a-allergens", value: { valueIds: [] } }], two)).toEqual([])
  })
})

describe("recategorise (101)", () => {
  it("drops what the new leaf does not ask for and re-defaults untouched facts", () => {
    const out = recategorise(
      {
        details: [{ attributeId: "a-allergens", value: { valueIds: ["milk"] } }, { attributeId: "a-weight", value: { number: "1", unit: "kg" } }],
        facts: { storage: "frozen", gstStatus: "taxable", ageRestricted: false },
        factsTouched: ["storage"],
      },
      rows,
      [weight],
      { storage: "ambient", gstStatus: "gst_free", ageRestricted: null },
    )
    expect(out.details.map((d) => d.attributeId)).toEqual(["a-weight"])
    expect(out.dropped).toEqual(["Allergens"])
    expect(out.facts).toEqual({ storage: "frozen", gstStatus: "gst_free", ageRestricted: null })
  })
})

describe("formatAttributeValue and stock dates (101)", () => {
  it("reads values the way a customer reads a label", () => {
    expect(formatAttributeValue(weight, { number: "1.5", unit: "kg" })).toBe("1.5 kg")
    expect(formatAttributeValue(allergens, { valueIds: ["milk", "eggs"] })).toBe("Milk, Eggs")
    expect(formatAttributeValue(released, { date: "2026-03-03" })).toBe("3 March 2026")
    expect(formatAttributeValue(ingredients, { boolean: true })).toBe("Yes")
  })

  it("refuses stock-date names", () => {
    for (const n of ["Expiry date", "Best before", "Use by", "Manufacture date", "Packed on", "Batch number", "Lot"]) {
      expect(isStockDateName(n)).toBe(true)
    }
    for (const n of ["Allergens", "Release date", "Warranty", "Colour", "Pilot light"]) expect(isStockDateName(n)).toBe(false)
  })
})
