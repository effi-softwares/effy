import { describe, expect, it } from "vitest"

import type { SavedVerdict } from "@effy/shared-types"

import { isPurchasable, verdictNote } from "./saved-display"

const ALL: SavedVerdict[] = [
  "purchasable",
  "temporarily_unavailable",
  "not_delivered_to_your_area",
  "no_longer_sold",
  "not_yet_determined",
]

describe("saved-display", () => {
  /**
   * ⚠ THE CENTRAL ASSERTION OF THE FEATURE, in one test. If any two outcomes ever say the same thing,
   * a shopper cannot tell whether to wait, change their address, or give up — which is exactly the
   * failure the predecessor shipped by collapsing all five into one `available` boolean.
   */
  it("gives every outcome a distinct sentence", () => {
    const notes = ALL.map(verdictNote)
    expect(new Set(notes).size).toBe(ALL.length)
  })

  it("never leaves an outcome unspoken", () => {
    for (const v of ALL) {
      expect(verdictNote(v).trim().length).toBeGreaterThan(0)
    }
  })

  /**
   * ⚠ "Unavailable" and "we don't deliver that to you" are DIFFERENT STATEMENTS and only one is true
   * in any given case. This pins that they do not converge on the same wording.
   */
  it("distinguishes out-of-stock from not-delivered-here", () => {
    expect(verdictNote("temporarily_unavailable")).not.toBe(verdictNote("not_delivered_to_your_area"))
    expect(verdictNote("not_delivered_to_your_area").toLowerCase()).toContain("area")
    expect(verdictNote("temporarily_unavailable").toLowerCase()).toContain("stock")
  })

  it("asks an unlocated shopper for a location rather than claiming availability", () => {
    const note = verdictNote("not_yet_determined").toLowerCase()
    expect(note).not.toContain("available now")
    expect(note).toContain("where you live")
  })

  it("says a withdrawn product is gone rather than merely unavailable", () => {
    expect(verdictNote("no_longer_sold").toLowerCase()).toContain("no longer")
  })

  it("only a purchasable item may be added to a cart", () => {
    expect(isPurchasable("purchasable")).toBe(true)
    for (const v of ALL.filter((v) => v !== "purchasable")) {
      expect(isPurchasable(v)).toBe(false)
    }
  })
})
