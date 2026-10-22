import { describe, expect, it } from "vitest"

import { optionCombinations, validateVariantSet, variantLabel, type OptionInputDTO, type VariantInputDTO } from "./variants"

let n = 0
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`

function size(values: string[]): OptionInputDTO {
  return { id: id(), position: 1, name: "Size", values: values.map((value, position) => ({ id: id(), value, position })) }
}
function flavour(values: string[]): OptionInputDTO {
  return { id: id(), position: 2, name: "Flavour", values: values.map((value, position) => ({ id: id(), value, position })) }
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
  it("joins values in option order", () => {
    const s = size(["500 g", "1 kg"])
    const f = flavour(["Plain", "Spiced"])
    expect(variantLabel([f, s], [s.values[0]!.id, f.values[1]!.id])).toBe("500 g / Spiced")
  })
  it("is null for a product with no options", () => {
    expect(variantLabel([], [null, null])).toBeNull()
  })
})

describe("optionCombinations", () => {
  it("one option → one row per value; two → the cross product; none → one", () => {
    const s = size(["500 g", "1 kg"])
    const f = flavour(["Plain", "Spiced", "Hot"])
    expect(optionCombinations([])).toEqual([[null, null]])
    expect(optionCombinations([s])).toHaveLength(2)
    expect(optionCombinations([f, s])).toHaveLength(6)
    expect(optionCombinations([s, f])[0]).toEqual([s.values[0]!.id, f.values[0]!.id])
  })
})

describe("validateVariantSet (FR-003, FR-006, FR-017)", () => {
  it("accepts a product with no options and one variant", () => {
    expect(validateVariantSet([], [variant(0, [null, null])], null)).toEqual([])
  })

  it("accepts a partial set of combinations", () => {
    const s = size(["500 g", "1 kg"])
    const f = flavour(["Plain", "Spiced"])
    const vs = [variant(0, [s.values[0]!.id, f.values[0]!.id]), variant(1, [s.values[1]!.id, f.values[0]!.id]), variant(2, [s.values[0]!.id, f.values[1]!.id])]
    expect(validateVariantSet([s, f], vs, null)).toEqual([])
  })

  it("refuses no variants, a duplicate combination, a missing value", () => {
    const s = size(["500 g", "1 kg"])
    expect(fields(validateVariantSet([], [], null))).toContain("variants")
    const dup = validateVariantSet([s], [variant(0, [s.values[0]!.id, null]), variant(1, [s.values[0]!.id, null])], null)
    expect(dup.some((e) => e.message.includes("combination"))).toBe(true)
    expect(fields(validateVariantSet([s], [variant(0, [null, null])], null))).toContain("variants[0].optionValueIds")
  })

  it("refuses a third option, too many values, and an unused value", () => {
    const third: OptionInputDTO = { ...size(["a"]), position: 3 as 1 }
    expect(fields(validateVariantSet([size(["a"]), flavour(["b"]), third], [], null))).toContain("options")
    const many = size(Array.from({ length: 21 }, (_, i) => `v${i}`))
    expect(fields(validateVariantSet([many], [variant(0, [many.values[0]!.id, null])], null))).toContain("options[0].values")
    const s = size(["500 g", "1 kg"])
    expect(fields(validateVariantSet([s], [variant(0, [s.values[0]!.id, null])], null))).toContain("options[0].values[1]")
  })

  it("refuses duplicate names and values case-insensitively", () => {
    const s = size(["1 kg", "1 KG"])
    expect(fields(validateVariantSet([s], [variant(0, [s.values[0]!.id, null]), variant(1, [s.values[1]!.id, null])], null))).toContain("options[0].values[1].value")
  })

  it("refuses a missing price, a was-price not above the price, and a shared stock code", () => {
    const s = size(["a", "b"])
    const errs = fields(
      validateVariantSet(
        [s],
        [
          variant(0, [s.values[0]!.id, null], { shopPriceAmount: "", sku: "RICE" }),
          variant(1, [s.values[1]!.id, null], { shopCompareAtAmount: "4.00", sku: "rice" }),
        ],
        null,
      ),
    )
    expect(errs).toEqual(expect.arrayContaining(["variants[0].shopPriceAmount", "variants[1].shopCompareAtAmount", "variants[1].sku"]))
  })

  it("refuses a pack unit that does not match the basis, and half a pack size", () => {
    expect(fields(validateVariantSet([], [variant(0, [null, null], { packQuantity: "500", packUnit: "ml" })], "per_kg"))).toContain("variants[0].packUnit")
    expect(fields(validateVariantSet([], [variant(0, [null, null], { packQuantity: "500" })], "per_kg"))).toContain("variants[0].packQuantity")
    expect(validateVariantSet([], [variant(0, [null, null], { packQuantity: "500", packUnit: "g" })], "per_kg")).toEqual([])
  })
})
