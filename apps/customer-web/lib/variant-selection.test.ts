import { describe, expect, it } from "vitest"

import type { OptionDTO, StorefrontVariantDTO } from "@effy/shared-types"

import { initialVariantId, pickValue, selectorRows, valueState } from "./variant-selection"

const options: OptionDTO[] = [
  {
    // A staff-made category option (105: options come only from the category).
    id: "o1", position: 1, attributeId: "a-pack", name: "Pack",
    values: [{ id: "s5", value: "500 g", position: 0, allowedValueId: "p500" }, { id: "s1", value: "1 kg", position: 1, allowedValueId: "p1k" }],
  },
  {
    id: "o2", position: 2, attributeId: "a-colour", name: "Colour",
    values: [{ id: "tw", value: "White", position: 0, allowedValueId: "white" }, { id: "tb", value: "Brown", position: 1, allowedValueId: "brown" }],
  },
]

const v = (id: string, a: string, b: string, available = true): StorefrontVariantDTO => ({
  id, optionValueIds: [a, b], label: id, priceAmount: "1.00", compareAtAmount: null, unitPrice: null, available, imageUrl: null, details: [],
})

// G White, 500 g Brown (sold out), 1 kg White. No 1 kg Brown.
const variants = [v("5w", "s5", "tw"), v("5b", "s5", "tb", false), v("1w", "s1", "tw")]

describe("variant selection (098)", () => {
  it("opens on the variant the link named when it is on sale, else the platform's default", () => {
    expect(initialVariantId(variants, "5w", "1w")).toBe("1w")
    expect(initialVariantId(variants, "5w", "gone")).toBe("5w")
    expect(initialVariantId(variants, "5w", null)).toBe("5w")
  })

  it("marks a sold-out combination sold out, not hidden", () => {
    expect(valueState(variants, ["s5", "tw"], 1, "tb")).toBe("sold_out")
    expect(valueState(variants, ["s5", "tw"], 0, "s1")).toBe("available")
  })

  it("a value only reachable by moving the other choice is offered by what it would lead to", () => {
    // With 1 kg chosen, Brown exists only as 500 g Brown - sold out.
    expect(valueState(variants, ["s1", "tw"], 1, "tb")).toBe("sold_out")
  })

  it("picking keeps the other choice when that combination is sold, else moves to one that is", () => {
    expect(pickValue(variants, ["s5", "tw"], 0, "s1")?.id).toBe("1w")
    expect(pickValue(variants, ["s1", "tw"], 1, "tb")?.id).toBe("5b")
    expect(pickValue(variants, ["s5", "tb"], 0, "s1")?.id).toBe("1w")
  })

  it("draws every option in order with its values' states and the selection", () => {
    const rows = selectorRows(options, variants, variants[0]!)
    expect(rows.map((r) => r.option.name)).toEqual(["Pack", "Colour"])
    expect(rows[1]!.values).toEqual([
      { id: "tw", value: "White", state: "available", selected: true },
      { id: "tb", value: "Brown", state: "sold_out", selected: false },
    ])
  })
})
