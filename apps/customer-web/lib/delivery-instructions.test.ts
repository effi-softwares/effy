import { describe, expect, it } from "vitest"

import {
  clampNote,
  draftFrom,
  draftToRequest,
  EMPTY_DRAFT,
  handoverLabel,
  remainingCharacters,
  sameInstructions,
} from "./delivery-instructions"

describe("066 — the storefront's delivery-instructions draft", () => {
  it("an untouched draft sends nothing", () => {
    expect(draftToRequest(EMPTY_DRAFT)).toBeNull()
  })

  it("a whitespace-only note sends nothing", () => {
    expect(draftToRequest({ handover: null, note: "  \n  " })).toBeNull()
  })

  it("sends the normalised value, not what was typed", () => {
    expect(draftToRequest({ handover: "leave_at_door", note: "  Side   gate  " })).toEqual({
      handover: "leave_at_door",
      note: "Side gate",
    })
  })

  it("a preference alone is sent", () => {
    expect(draftToRequest({ handover: "meet_at_door", note: "" })).toEqual({ handover: "meet_at_door", note: null })
  })

  it("prefills from a saved default, and from nothing", () => {
    expect(draftFrom({ handover: "leave_at_door", note: "Side gate" })).toEqual({
      handover: "leave_at_door",
      note: "Side gate",
    })
    expect(draftFrom(null)).toEqual(EMPTY_DRAFT)
    expect(draftFrom(undefined)).toEqual(EMPTY_DRAFT)
  })

  /** FR-004 / FR-029 — the limit is characters as a person counts them. */
  it("⚠ counts and clamps in code points, so an emoji is one character", () => {
    expect(remainingCharacters("")).toBe(250)
    expect(remainingCharacters("🚪")).toBe(249)
    const full = "🚪".repeat(250)
    expect(remainingCharacters(full)).toBe(0)
    expect(clampNote(full + "x")).toBe(full)
    expect(clampNote("short")).toBe("short")
  })

  it("compares two drafts by what they would send", () => {
    expect(sameInstructions({ handover: null, note: "A  b" }, { handover: null, note: " A b " })).toBe(true)
    expect(sameInstructions({ handover: null, note: "A" }, { handover: "leave_at_door", note: "A" })).toBe(false)
  })

  it("has words for both preferences", () => {
    expect(handoverLabel("leave_at_door")).toBe("Leave at the door")
    expect(handoverLabel("meet_at_door")).toBe("Meet at the door")
  })
})
