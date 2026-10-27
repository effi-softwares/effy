import { describe, expect, it } from "vitest"

import type { CategoryFormRow, OptionInputDTO, ProductDetailDTO } from "@effy/shared-types"

import {
  addMissingRows,
  applyToAll,
  draftFromDetail,
  emptyRow,
  emptyVariantSet,
  labelledOptions,
  optionAttributes,
  rowLabel,
  syncRows,
  toInputs,
  variantSetErrors,
  type PackSizeDraft,
  type VariantSetDraft,
} from "./variants"

let n = 0
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`

const FLAVOUR = id()
const PLAIN = id()
const MANGO = id()
const flavourRow = {
  attributeId: FLAVOUR,
  key: "flavour",
  name: "Flavour",
  helpText: null,
  inputType: "single_select",
  unitFamily: null,
  units: [],
  min: null,
  max: null,
  decimals: null,
  maxLength: null,
  level: "optional",
  section: "Details",
  position: 1,
  values: [
    { id: PLAIN, label: "Plain" },
    { id: MANGO, label: "Mango" },
  ],
  filterable: true,
  customerVisible: true,
  variesByVariant: true,
  variantOption: true,
} as CategoryFormRow
const rows = [flavourRow, { ...flavourRow, attributeId: id(), key: "colour", name: "Colour", variantOption: false }]

/** A Pack size option with these sizes ("500 g"), and the packs map that sizes them. */
function packOption(
  position: number,
  sizes: string[],
): { option: OptionInputDTO; packs: Record<string, PackSizeDraft> } {
  const packs: Record<string, PackSizeDraft> = {}
  const values = sizes.map((s, i) => {
    const [quantity, unit] = s.split(" ")
    const vid = id()
    packs[vid] = { quantity: quantity!, unit: unit as PackSizeDraft["unit"] }
    return { id: vid, allowedValueId: null, position: i }
  })
  return { option: { id: id(), position, kind: "pack_size", attributeId: null, values }, packs }
}

const flavourOption = (position: number, valueIds: string[]): OptionInputDTO => ({
  id: id(),
  position,
  kind: "attribute",
  attributeId: FLAVOUR,
  values: valueIds.map((v, i) => ({ id: id(), allowedValueId: v, position: i })),
})

describe("101 — shop-web variant sets", () => {
  it("a new product has no options and one variant", () => {
    const s = emptyVariantSet()
    expect(s.options).toEqual([])
    expect(s.packs).toEqual({})
    expect(s.variants).toHaveLength(1)
  })

  it("offers Pack size plus the leaf's variant-option attributes", () => {
    expect(optionAttributes(rows).map((r) => r.name)).toEqual(["Flavour"])
  })

  it("labels values from the library and pack sizes from their size", () => {
    const { option, packs } = packOption(1, ["500 g", "1 kg"])
    const set: VariantSetDraft = { ...emptyVariantSet(), options: [option, flavourOption(2, [PLAIN, MANGO])], packs }
    const labelled = labelledOptions(set, rows)
    expect(labelled.map((o) => o.name)).toEqual(["Pack size", "Flavour"])
    expect(labelled.flatMap((o) => o.values.map((v) => v.value))).toEqual(["500 g", "1 kg", "Plain", "Mango"])
    const variants = syncRows([], set.options, set.variants)
    expect(variants.map((r) => rowLabel(set, r, rows))).toEqual([
      "500 g / Plain",
      "500 g / Mango",
      "1 kg / Plain",
      "1 kg / Mango",
    ])
  })

  it("adding an option to a one-variant product keeps that variant as the first value, with its price", () => {
    const start: VariantSetDraft = { ...emptyVariantSet() }
    start.variants[0]!.shopPriceAmount = "3.20"
    const flavour = flavourOption(1, [PLAIN, MANGO])
    const out = syncRows([], [flavour], start.variants)
    expect(out).toHaveLength(2)
    expect(out[0]!.id).toBe(start.variants[0]!.id) // keeps its stock and history
    expect(out.map((r) => r.shopPriceAmount)).toEqual(["3.20", "3.20"])
  })

  it("a deleted combination is not brought back by another change, only by 'Add missing'", () => {
    const flavour = flavourOption(1, [PLAIN, MANGO])
    const kept = syncRows([], [flavour], [emptyRow(0)]).slice(0, 1)
    expect(syncRows([flavour], [{ ...flavour }], kept)).toHaveLength(1)
    expect(addMissingRows({ unitBasis: "", options: [flavour], packs: {}, variants: kept })).toHaveLength(2)
  })

  it("every variant naming a pack size value is sent with that size", () => {
    const { option, packs } = packOption(1, ["500 g", "1 kg"])
    const variants = syncRows([], [option], [emptyRow(0)]).map((r) => ({ ...r, shopPriceAmount: "2.00" }))
    const out = toInputs({ unitBasis: "", options: [option], packs, variants })
    expect(out.variants.map((v) => [v.packQuantity, v.packUnit])).toEqual([
      ["500", "g"],
      ["1", "kg"],
    ])
    expect(out.options[0]).toMatchObject({ kind: "pack_size", attributeId: null })
    expect(variantSetErrors({ unitBasis: "", options: [option], packs, variants })).toEqual({})
  })

  it("refusals arrive on the server's own field paths", () => {
    const s = emptyVariantSet()
    expect(variantSetErrors(s)["variants[0].shopPriceAmount"]).toBeTruthy()
    s.variants[0]!.shopPriceAmount = "4.50"
    expect(variantSetErrors(s)).toEqual({})
  })

  it("an unused option value is dropped before sending, with its library value", () => {
    const flavour = flavourOption(1, [PLAIN, MANGO])
    const variants = syncRows([], [flavour], [emptyRow(0)])
      .slice(0, 1)
      .map((r) => ({ ...r, shopPriceAmount: "1.00" }))
    const out = toInputs({ unitBasis: "", options: [flavour], packs: {}, variants })
    expect(out.options[0]!.values.map((v) => v.allowedValueId)).toEqual([PLAIN])
  })

  it("opens on the pending proposal when there is one; an assumed weight is seeded blank; pack sizes come from the variants", () => {
    const packValue = id()
    const detail = {
      unitBasis: null,
      options: [
        {
          id: "o1",
          position: 1,
          kind: "pack_size",
          attributeId: null,
          name: "Pack size",
          values: [{ id: packValue, value: "500 g", position: 0, allowedValueId: null }],
        },
      ],
      media: [],
      variants: [
        {
          id: "v1",
          position: 0,
          optionValueIds: [packValue, null],
          sku: null,
          gtin: null,
          shopPriceAmount: "2.00",
          shopCompareAtAmount: null,
          weightGrams: 500,
          weightIsAssumed: true,
          packQuantity: "500",
          packUnit: "g",
          mediaId: null,
          state: "active",
        },
      ],
      pendingChange: null,
    } as unknown as ProductDetailDTO
    const draft = draftFromDetail(detail)
    expect(draft.variants[0]).toMatchObject({ id: "v1", shopPriceAmount: "2.00", weightGrams: "" })
    expect(draft.packs[packValue]).toEqual({ quantity: "500", unit: "g" })
    const pending = {
      ...detail,
      pendingChange: {
        proposed: {
          options: [],
          variants: [{ id: "v1", position: 0, optionValueIds: [null, null], shopPriceAmount: "2.50" }],
        },
      },
    } as unknown as ProductDetailDTO
    expect(draftFromDetail(pending).variants[0]!.shopPriceAmount).toBe("2.50")
  })
})

describe("applyToAll (098)", () => {
  it("copies the first row's price or weight down the column, and never a code", () => {
    const set: VariantSetDraft = {
      unitBasis: "",
      options: [],
      packs: {},
      variants: [
        { ...emptyRow(0), shopPriceAmount: "4.50", weightGrams: "500", sku: "A" },
        { ...emptyRow(1), shopPriceAmount: "", weightGrams: "", sku: "B" },
      ],
    }
    const priced = applyToAll(set, "shopPriceAmount")
    expect(priced.map((r) => r.shopPriceAmount)).toEqual(["4.50", "4.50"])
    expect(priced.map((r) => r.sku)).toEqual(["A", "B"])
    expect(applyToAll(set, "weightGrams").map((r) => r.weightGrams)).toEqual(["500", "500"])
  })

  it("a new row has no Effy code until it is saved", () => {
    expect(emptyRow(0).code).toBeNull()
  })
})
