import { describe, expect, it } from "vitest"

import type { OptionInputDTO, ProductDetailDTO } from "@effy/shared-types"

import {
  addMissingRows,
  applyToAll,
  draftFromDetail,
  emptyRow,
  emptyVariantSet,
  syncRows,
  toInputs,
  variantSetErrors,
  type VariantSetDraft,
} from "./variants"

let n = 0
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`
const option = (position: number, name: string, values: string[]): OptionInputDTO => ({
  id: id(),
  position,
  name,
  values: values.map((value, i) => ({ id: id(), value, position: i })),
})

describe("098 — shop-web variant sets", () => {
  it("a new product has no options and one variant", () => {
    const s = emptyVariantSet()
    expect(s.options).toEqual([])
    expect(s.variants).toHaveLength(1)
  })

  it("adding Size to a one-variant product keeps that variant as the first size, with its price", () => {
    const start: VariantSetDraft = { ...emptyVariantSet() }
    start.variants[0]!.shopPriceAmount = "3.20"
    const size = option(1, "Size", ["500 g", "1 kg"])
    const rows = syncRows([], [size], start.variants)
    expect(rows).toHaveLength(2)
    expect(rows[0]!.id).toBe(start.variants[0]!.id) // keeps its stock and history
    expect(rows[0]!.shopPriceAmount).toBe("3.20")
    expect(rows[1]!.shopPriceAmount).toBe("3.20")
  })

  it("a deleted combination is not brought back by another change, only by 'Add missing'", () => {
    const size = option(1, "Size", ["500 g", "1 kg"])
    let rows = syncRows([], [size], [emptyRow(0)])
    rows = rows.slice(0, 1) // the shop deletes the 1 kg row
    const renamed = { ...size, name: "Pack size" }
    expect(syncRows([size], [renamed], rows)).toHaveLength(1)
    expect(addMissingRows({ unitBasis: "", options: [renamed], variants: rows })).toHaveLength(2)
  })

  it("a new value brings its combinations in", () => {
    const size = option(1, "Size", ["500 g"])
    const rows = syncRows([], [size], [emptyRow(0)])
    const more = { ...size, values: [...size.values, { id: id(), value: "1 kg", position: 1 }] }
    expect(syncRows([size], [more], rows)).toHaveLength(2)
  })

  it("refusals arrive on the server's own field paths", () => {
    const s = emptyVariantSet()
    expect(variantSetErrors(s)["variants[0].shopPriceAmount"]).toBeTruthy()
    s.variants[0]!.shopPriceAmount = "4.50"
    expect(variantSetErrors(s)).toEqual({})
  })

  it("an unused option value is dropped before sending", () => {
    const size = option(1, "Size", ["500 g", "1 kg"])
    const rows = syncRows([], [size], [emptyRow(0)])
      .slice(0, 1)
      .map((r) => ({ ...r, shopPriceAmount: "1.00" }))
    const out = toInputs({ unitBasis: "", options: [size], variants: rows })
    expect(out.options[0]!.values.map((v) => v.value)).toEqual(["500 g"])
  })

  it("opens on the pending proposal when there is one; an assumed weight is seeded blank", () => {
    const detail = {
      unitBasis: null,
      options: [],
      media: [],
      variants: [
        {
          id: "v1",
          position: 0,
          optionValueIds: [null, null],
          sku: null,
          gtin: null,
          shopPriceAmount: "2.00",
          shopCompareAtAmount: null,
          weightGrams: 500,
          weightIsAssumed: true,
          packQuantity: null,
          packUnit: null,
          mediaId: null,
          state: "active",
        },
      ],
      pendingChange: null,
    } as unknown as ProductDetailDTO
    expect(draftFromDetail(detail).variants[0]).toMatchObject({ id: "v1", shopPriceAmount: "2.00", weightGrams: "" })
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
    const set = {
      unitBasis: "" as const,
      options: [],
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
