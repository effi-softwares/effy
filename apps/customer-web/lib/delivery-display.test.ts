import { describe, expect, it } from "vitest"

import { announcePlace, formatPlace } from "./delivery-display"

/**
 * ⚠ These cases come from the FOUR-ROW TABLE in
 * `specs/030-delivery-location-suburb/contracts/locality.contract.md` §2 — not from reading the
 * implementation. 028 and 029 both shipped tests whose fixtures agreed with the code rather than with
 * the world (029's banner test literally asserted the defect it should have caught). Writing these
 * against the contract instead of the code is the counter-measure.
 *
 * The same four rows are asserted on mobile in `DeliveryDisplayTest.kt`. If the two surfaces ever
 * disagree, one of these files is wrong and the shopper is being told two different things.
 */
describe("formatPlace — the display rule (contract §2)", () => {
  it("names the place the shopper chose from the list", () => {
    expect(formatPlace({ locality: "Richmond", state: "VIC", postcode: "3121" })).toBe("Richmond VIC 3121")
  })

  /**
   * ⚠ FR-034. The shopper typed digits; a postcode covering several suburbs has no single right
   * name, and picking one asserts a choice they never made.
   */
  it("does NOT invent a suburb for a bare postcode covering several localities", () => {
    expect(formatPlace({ locality: null, state: "VIC", postcode: "3121" })).toBe("VIC 3121")
  })

  /** FR-034a: with exactly one candidate there is nothing to choose between, so naming it is safe. */
  it("names the sole candidate for a bare postcode covering exactly one locality", () => {
    expect(formatPlace({ locality: "Melbourne", state: "VIC", postcode: "3000" })).toBe(
      "Melbourne VIC 3000",
    )
  })

  /** FR-034b: a failed name lookup degrades to digits — and must not touch the verdict. */
  it("falls back to the bare postcode when the lookup resolved nothing", () => {
    expect(formatPlace({ locality: null, state: null, postcode: "3121" })).toBe("3121")
  })

  it("treats absent fields the same as null", () => {
    expect(formatPlace({ postcode: "3121" })).toBe("3121")
  })

  /**
   * ⚠ A set location that renders as an empty string is indistinguishable from no location at all —
   * the shopper would see "Set location" while one is stored.
   */
  it("never returns an empty string for a set location", () => {
    for (const place of [
      { postcode: "3121" },
      { locality: null, state: null, postcode: "0800" },
      { locality: "Darwin", state: "NT", postcode: "0800" },
    ]) {
      expect(formatPlace(place).length).toBeGreaterThan(0)
    }
  })

  /** ⚠ NT postcodes begin 08xx and must survive as text all the way to the screen. */
  it("preserves a leading-zero postcode", () => {
    expect(formatPlace({ locality: "Darwin", state: "NT", postcode: "0800" })).toBe("Darwin NT 0800")
  })

  /** The postcode is what the verdict is keyed on, so it is always present. */
  it("always includes the postcode", () => {
    expect(formatPlace({ locality: "Richmond", state: "VIC", postcode: "3121" })).toContain("3121")
    expect(formatPlace({ postcode: "3121" })).toContain("3121")
  })
})

describe("announcePlace — FR-042, the same words as the display", () => {
  const richmond = { locality: "Richmond", state: "VIC", postcode: "3121" }

  it("names the place exactly as the visible display does", () => {
    const visible = formatPlace(richmond)
    expect(announcePlace(richmond, true)).toContain(visible)
    expect(announcePlace(richmond, false)).toContain(visible)
  })

  it("distinguishes delivering from not delivering", () => {
    expect(announcePlace(richmond, true)).toBe("Effy delivers to Richmond VIC 3121.")
    expect(announcePlace(richmond, false)).toBe("Effy does not deliver to Richmond VIC 3121 yet.")
  })

  /**
   * ⚠ THE RULE THIS WHOLE CAPABILITY EXISTS FOR. `serviced === null` means "we have not got an
   * answer" — it is NOT "no", and it must never be announced as one. Silence is correct here: the
   * live region says nothing until there is something true to say.
   */
  it("announces NOTHING when there is no answer yet", () => {
    expect(announcePlace(richmond, null)).toBe("")
  })
})
