import { describe, expect, it } from "vitest"

import { initialsFor } from "./initials"

/**
 * SC-010 — "zero blank circles, zero mangled glyphs, and no letter ever guessed from the email".
 *
 * These cases are not exotic. They are ordinary customers, and every one of them is a bug that ships
 * in real products constantly.
 */
describe("initialsFor", () => {
  it("takes two initials from a first and last name", () => {
    expect(initialsFor("Janith", "Madarasinghe")).toBe("JM")
  })

  // ⚠ ONE word → ONE initial. Not "CH". Taking two letters from a single word is how you get
  // "CHer" and "MAdonna".
  it("takes ONE initial from a one-word name", () => {
    expect(initialsFor("Cher", null)).toBe("C")
    expect(initialsFor(null, "Prince")).toBe("P")
  })

  it("falls back to the neutral glyph for no name at all", () => {
    expect(initialsFor(null, null)).toBeNull()
    expect(initialsFor("", "")).toBeNull()
    expect(initialsFor("   ", "  ")).toBeNull()
  })

  // ⚠ `str[0]` on this returns HALF AN EMOJI — a lone surrogate, which renders as a replacement
  // glyph. This is the single most common initials bug in the wild.
  it("NEVER returns half an emoji", () => {
    expect(initialsFor("👨‍👩‍👧", "Smith")).toBe("S") // the emoji yields nothing; the surname still works
    expect(initialsFor("🎉", null)).toBeNull()
  })

  // A single CJK/Arabic/Devanagari character is not an "initial" — it is the name, or a fragment of
  // one. We do not have a defensible algorithm for scripts we cannot reason about, so we decline.
  it("falls back to the neutral glyph for non-Latin scripts rather than mangling them", () => {
    expect(initialsFor("李", "明")).toBeNull()
    expect(initialsFor("محمد", null)).toBeNull()
    expect(initialsFor("Пётр", null)).toBeNull()
    expect(initialsFor("आर्यन", null)).toBeNull()
  })

  // ⚠ Turkish: dotless ı uppercases to İ in tr, to I in en. `toLocaleUpperCase()` gets this right;
  // `toUpperCase()` does not. We assert only that a letter comes back, since the runtime locale
  // decides which — the point is that it is NOT dropped and NOT mangled.
  it("handles the Turkish dotless i without dropping the initial", () => {
    expect(initialsFor("ırmak", "Yılmaz")).toMatch(/^.Y$/u)
  })

  // "Ángela" may be A + U+0301 rather than the precomposed Á. Without mark-stripping before the
  // script test, an ordinary Spanish name silently loses its initial.
  it("keeps the initial for accented and combining-mark names", () => {
    expect(initialsFor("Ángela", "Núñez")).toBe("ÁN")
    expect(initialsFor("Ángela", "Nũñez")).toMatch(/^.{1,2}N/u)
  })

  it("ignores leading digits and punctuation rather than showing them", () => {
    expect(initialsFor("3", null)).toBeNull()
    expect(initialsFor("-", "Smith")).toBe("S")
  })

  it("trims surrounding whitespace", () => {
    expect(initialsFor("  Janith ", " Madarasinghe ")).toBe("JM")
  })
})
