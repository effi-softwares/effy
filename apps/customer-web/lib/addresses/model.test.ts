import { describe, expect, it } from "vitest"

import { chipForLabel, customLabelForLabel, labelForChip } from "./model"

/** The label chip ↔ free-text mapping (FR-006a, data-model §"The label chips → free-text mapping"). */
describe("address label chips", () => {
  it("maps Home/Work stored labels back to their chip", () => {
    expect(chipForLabel("Home")).toBe("Home")
    expect(chipForLabel("Work")).toBe("Work")
  })

  it("maps any other non-empty label to Other with the value in the free text", () => {
    expect(chipForLabel("Mum’s place")).toBe("Other")
    expect(customLabelForLabel("Mum’s place")).toBe("Mum’s place")
  })

  it("maps an absent/blank label to no chip", () => {
    expect(chipForLabel(null)).toBeNull()
    expect(chipForLabel("")).toBeNull()
    expect(chipForLabel("   ")).toBeNull()
    expect(customLabelForLabel("Home")).toBe("")
  })

  it("round-trips chip → wire label", () => {
    expect(labelForChip("Home", "")).toBe("Home")
    expect(labelForChip("Work", "")).toBe("Work")
    expect(labelForChip("Other", "Mum’s place")).toBe("Mum’s place")
    expect(labelForChip("Other", "  ")).toBeNull() // blank Other → no label
    expect(labelForChip(null, "ignored")).toBeNull()
  })
})
