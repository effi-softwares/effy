import { describe, expect, it } from "vitest"

import { PATTERNS, STOP, START_B, code128BSvg, code128BValues, code128BWidths } from "./code128"

describe("Code 128 B (089)", () => {
  it("has 107 patterns: each eleven modules (STOP thirteen), all distinct", () => {
    expect(PATTERNS).toHaveLength(107)
    PATTERNS.forEach((p, v) => {
      const sum = [...p].map(Number).reduce((a, b) => a + b, 0)
      expect(sum, `pattern ${v}`).toBe(v === STOP ? 13 : 11)
    })
    expect(new Set(PATTERNS).size).toBe(107)
  })

  it("encodes a character as its code minus 32, with the weighted checksum mod 103", () => {
    // "A": Start B + 33 → (104 + 33·1) mod 103 = 34.
    expect(code128BValues("A")).toEqual([START_B, 33, 34])
    // "AB": (104 + 33·1 + 34·2) mod 103 = 205 mod 103 = 102.
    expect(code128BValues("AB")).toEqual([START_B, 33, 34, 102])
  })

  it("encodes a package token end to end", () => {
    const values = code128BValues("EFY1:7K3Q9M")
    expect(values).toHaveLength(13) // start + 11 characters + checksum
    const widths = code128BWidths("EFY1:7K3Q9M")
    // 13 symbols (start, 11 characters, checksum) × 11 modules + stop's 13.
    expect(widths.reduce((a, b) => a + b, 0)).toBe(13 * 11 + 13)
    expect(widths.slice(0, 6)).toEqual([2, 1, 1, 2, 1, 4]) // Start B
    expect(widths.slice(-7)).toEqual([2, 3, 3, 1, 1, 1, 2]) // Stop
  })

  it("refuses a character set B cannot carry", () => {
    expect(() => code128BValues("é")).toThrow()
    expect(() => code128BValues("\n")).toThrow()
  })

  it("draws one bar per pattern bar, inside a quiet zone", () => {
    const svg = code128BSvg("EFY1:7K3Q9M", { moduleMm: 0.33, heightMm: 12 })
    expect(svg.match(/<rect x=/g)).toHaveLength(code128BWidths("EFY1:7K3Q9M").filter((_, i) => i % 2 === 0).length)
    expect(svg).toContain('height="12mm"')
  })
})
