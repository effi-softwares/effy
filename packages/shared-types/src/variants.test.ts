import { describe, expect, it } from "vitest"

import type { CategoryFormRow } from "./taxonomy"
import {
  optionCombinations, packLabel, validateOptionsAgainstForm, validateVariantSet, variantLabel, type OptionInputDTO,
  type VariantInputDTO,
} from "./variants"

let n = 0
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`

const FLAVOUR_ATTR = id()
const PLAIN = id()
const SPICED = id()
const HOT = id()
const COLOUR_ATTR = id()
const COLOURS = Array.from({ length: 4 }, () => id())

/** Colour, position 1, with `count` values from its list. */
function colour(count: number): OptionInputDTO {
  return { id: id(), position: 1, attributeId: COLOUR_ATTR, values: COLOURS.slice(0, count).map((a, position) => ({ id: id(), allowedValueId: a, position })) }
}
function flavour(allowed: string[], position: 1 | 2 = 2): OptionInputDTO {
  return { id: id(), position, attributeId: FLAVOUR_ATTR, values: allowed.map((a, p) => ({ id: id(), allowedValueId: a, position: p })) }
}
const variant = (position: number, ids: [string | null, string | null], extra: Partial<VariantInputDTO> = {}): VariantInputDTO => ({
  id: id(),
  position,
  optionValueIds: ids,
  shopPriceAmount: "4.50",
  ...extra,
})
const fields = (errs: { field: string }[]) => errs.map((e) => e.field)

describe("variantLabel", () => {
  it("joins value labels in option order", () => {
    const options = [
      { position: 2, values: [{ id: "f1", value: "Plain" }, { id: "f2", value: "Spiced" }] },
      { position: 1, values: [{ id: "s1", value: "Red" }] },
    ]
    expect(variantLabel(options, ["s1", "f2"])).toBe("Red / Spiced")
  })
  it("is null for a product with no options", () => {
    expect(variantLabel([], [null, null])).toBeNull()
  })
})

describe("packLabel", () => {
  it("says a pack size the way a pack does", () => {
    expect(packLabel("500", "g")).toBe("500 g")
    expect(packLabel("1.250", "l")).toBe("1.25 L")
    expect(packLabel("12", "each")).toBe("12 pack")
    expect(packLabel("0", "g")).toBeNull()
  })
})

describe("optionCombinations", () => {
  it("one option → one row per value; two → the cross product; none → one", () => {
    const s = colour(2)
    const f = flavour([PLAIN, SPICED, HOT])
    expect(optionCombinations([])).toEqual([[null, null]])
    expect(optionCombinations([s])).toHaveLength(2)
    expect(optionCombinations([f, s])).toHaveLength(6)
    expect(optionCombinations([s, f])[0]).toEqual([s.values[0]!.id, f.values[0]!.id])
  })
})

describe("validateVariantSet (098, 101)", () => {
  it("accepts a product with no options and one variant", () => {
    expect(validateVariantSet([], [variant(0, [null, null])], null)).toEqual([])
  })

  it("accepts a partial set of combinations, each variant with its own net quantity", () => {
    const s = colour(2)
    const f = flavour([PLAIN, SPICED])
    const vs = [
      variant(0, [s.values[0]!.id, f.values[0]!.id], { packQuantity: "500", packUnit: "g" }),
      variant(1, [s.values[1]!.id, f.values[0]!.id], { packQuantity: "1", packUnit: "kg" }),
      variant(2, [s.values[0]!.id, f.values[1]!.id]),
    ]
    expect(validateVariantSet([s, f], vs, "per_kg")).toEqual([])
  })

  it("refuses no variants, a duplicate combination, a missing value", () => {
    const f = flavour([PLAIN, SPICED], 1)
    expect(fields(validateVariantSet([], [], null))).toContain("variants")
    const dup = validateVariantSet([f], [variant(0, [f.values[0]!.id, null]), variant(1, [f.values[0]!.id, null])], null)
    expect(dup.some((e) => e.message.includes("combination"))).toBe(true)
    expect(fields(validateVariantSet([f], [variant(0, [null, null])], null))).toContain("variants[0].optionValueIds")
  })

  it("refuses a third option, too many values, and an unused value", () => {
    const third: OptionInputDTO = { ...flavour([PLAIN]), position: 3 as 1 }
    expect(fields(validateVariantSet([colour(1), flavour([PLAIN]), third], [], null))).toContain("options")
    const many = { ...flavour(Array.from({ length: 21 }, () => id()), 1) }
    expect(fields(validateVariantSet([many], [variant(0, [many.values[0]!.id, null])], null))).toContain("options[0].values")
    const f = flavour([PLAIN, SPICED], 1)
    expect(fields(validateVariantSet([f], [variant(0, [f.values[0]!.id, null])], null))).toContain("options[0].values[1]")
  })

  it("refuses an attribute option without its attribute or values, and the same value twice", () => {
    const noAttr = { ...flavour([PLAIN], 1), attributeId: null } as unknown as OptionInputDTO
    expect(fields(validateVariantSet([noAttr], [variant(0, [noAttr.values[0]!.id, null])], null))).toContain("options[0].attributeId")
    const twice = flavour([PLAIN, PLAIN], 1)
    expect(fields(validateVariantSet([twice], [variant(0, [twice.values[0]!.id, null]), variant(1, [twice.values[1]!.id, null])], null)))
      .toContain("options[0].values[1].allowedValueId")
  })

  it("refuses two options on the same attribute, and a value not from the list", () => {
    const a = flavour([PLAIN], 1)
    const b = flavour([SPICED], 2)
    expect(fields(validateVariantSet([a, b], [variant(0, [a.values[0]!.id, b.values[0]!.id])], null))).toContain("options[1].attributeId")
    const off = { ...flavour([PLAIN], 1), values: [{ id: id(), allowedValueId: "", position: 0 }] }
    expect(fields(validateVariantSet([off], [variant(0, [off.values[0]!.id, null])], null))).toContain("options[0].values[0].allowedValueId")
  })

  it("refuses a missing price, a was-price not above the price, and a shared stock code", () => {
    const f = flavour([PLAIN, SPICED], 1)
    const errs = fields(
      validateVariantSet(
        [f],
        [
          variant(0, [f.values[0]!.id, null], { shopPriceAmount: "", sku: "RICE" }),
          variant(1, [f.values[1]!.id, null], { shopCompareAtAmount: "4.00", sku: "rice" }),
        ],
        null,
      ),
    )
    expect(errs).toEqual(expect.arrayContaining(["variants[0].shopPriceAmount", "variants[1].shopCompareAtAmount", "variants[1].sku"]))
  })

  it("refuses a net-quantity unit that does not match the basis, and half a net quantity", () => {
    expect(fields(validateVariantSet([], [variant(0, [null, null], { packQuantity: "500", packUnit: "ml" })], "per_kg"))).toContain("variants[0].packUnit")
    expect(fields(validateVariantSet([], [variant(0, [null, null], { packQuantity: "500" })], "per_kg"))).toContain("variants[0].packQuantity")
    expect(validateVariantSet([], [variant(0, [null, null], { packQuantity: "500", packUnit: "g" })], "per_kg")).toEqual([])
  })
})

describe("validateOptionsAgainstForm (101)", () => {
  const row = (over: Partial<CategoryFormRow>): CategoryFormRow => ({
    attributeId: FLAVOUR_ATTR, key: "flavour", name: "Flavour", helpText: null, inputType: "single_select", unitFamily: null,
    units: [], min: null, max: null, decimals: null, maxLength: null, values: [{ id: PLAIN, label: "Plain" }, { id: SPICED, label: "Spiced" }],
    level: "optional", section: "Details", position: 0, filterable: true, customerVisible: true, variesByVariant: true,
    variantOption: true, ...over,
  })

  it("accepts an option the leaf offers, with values from its list", () => {
    expect(validateOptionsAgainstForm([flavour([PLAIN, SPICED])], [row({})])).toEqual([])
  })

  it("refuses an attribute the leaf does not offer as an option, and a value off its list", () => {
    expect(fields(validateOptionsAgainstForm([flavour([PLAIN])], [row({ variantOption: false })]))).toEqual(["options[0].attributeId"])
    expect(fields(validateOptionsAgainstForm([flavour([HOT])], [row({})]))).toEqual(["options[0].values[0].allowedValueId"])
    expect(fields(validateOptionsAgainstForm([flavour([PLAIN])], []))).toEqual(["options[0].attributeId"])
  })
})
