import { describe, expect, it } from "vitest"

import { formatQuantity, fromBase, toBase, unitBelongs, unitsOf, UNIT_FAMILIES } from "./units"

describe("units (101)", () => {
  it("converts to the family's base unit", () => {
    expect(toBase(1.5, "mass", "kg")).toBe(1500)
    expect(toBase(1500, "mass", "g")).toBe(1500)
    expect(toBase(1.25, "volume", "L")).toBe(1250)
    expect(toBase(2, "data", "TB")).toBe(2000)
    expect(toBase(65, "length", "in")).toBe(1651)
    expect(toBase(2, "duration", "y")).toBe(1051200)
  })

  it("converts back for a range shown in the attribute's first unit", () => {
    expect(fromBase(1651, "length", "in")).toBe(65)
    expect(fromBase(250, "mass", "kg")).toBe(0.25)
  })

  it("refuses a unit from another family", () => {
    expect(() => toBase(1, "mass", "L")).toThrow()
    expect(unitBelongs("volume", "mL")).toBe(true)
    expect(unitBelongs("volume", "ml")).toBe(false)
  })

  it("every family's base unit is one of its units at factor 1", () => {
    for (const def of Object.values(UNIT_FAMILIES)) expect(def.units[def.base]).toBe(1)
    expect(unitsOf("count")).toEqual(["pieces", "sheets", "rolls", "packs"])
  })

  it("says a quantity the way a label does", () => {
    expect(formatQuantity(1.5, "kg")).toBe("1.5 kg")
    expect(formatQuantity(12, "pieces")).toBe("12 pieces")
    expect(formatQuantity(1, "y")).toBe("1 year")
    expect(formatQuantity(24, "mo")).toBe("24 months")
    expect(formatQuantity(0.1 + 0.2, "L")).toBe("0.3 L")
    expect(formatQuantity(4.5, null)).toBe("4.5")
  })
})
