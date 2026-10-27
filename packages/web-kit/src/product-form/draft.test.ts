import { beforeEach, describe, expect, it } from "vitest"

import { clearDraft, draftKey, emptyDraft, loadDraft, saveDraft } from "./draft"

describe("catalog draft store", () => {
  beforeEach(() => window.localStorage.clear())

  it("keys the draft per shop AND subject", () => {
    expect(draftKey("shop-1", "sub-a")).not.toBe(draftKey("shop-2", "sub-a"))
    expect(draftKey("shop-1", "sub-a")).not.toBe(draftKey("shop-1", "sub-b"))
  })

  it("round-trips a saved draft", () => {
    const draft = {
      ...emptyDraft(),
      step: 2,
      name: "Flat White",
      facts: { storage: "chilled" as const, gstStatus: "taxable" as const, ageRestricted: false },
      factsTouched: ["storage" as const],
      details: [{ attributeId: "a1", value: { text: "Oat" } }],
    }
    saveDraft("shop-1", "sub-a", draft)
    expect(loadDraft("shop-1", "sub-a")).toEqual(draft)
  })

  it("isolates drafts between operators sharing a browser", () => {
    saveDraft("shop-1", "sub-a", { ...emptyDraft(), name: "A's product" })
    saveDraft("shop-1", "sub-b", { ...emptyDraft(), name: "B's product" })
    expect(loadDraft("shop-1", "sub-a")?.name).toBe("A's product")
    expect(loadDraft("shop-1", "sub-b")?.name).toBe("B's product")
  })

  it("returns null when there is no draft", () => {
    expect(loadDraft("shop-1", "sub-a")).toBeNull()
  })

  it("treats a malformed blob as no draft (never throws)", () => {
    window.localStorage.setItem(draftKey("shop-1", "sub-a"), "{not json")
    expect(loadDraft("shop-1", "sub-a")).toBeNull()
  })

  it("merges a partial/legacy blob over a fresh draft (no undefined fields)", () => {
    window.localStorage.setItem(draftKey("shop-1", "sub-a"), JSON.stringify({ name: "Old" }))
    const loaded = loadDraft("shop-1", "sub-a")
    expect(loaded?.name).toBe("Old")
    expect(loaded?.details).toEqual([])
    expect(loaded?.facts).toEqual({ storage: null, gstStatus: null, ageRestricted: null })
    // A pre-variants draft starts with one empty variant.
    expect(loaded?.variantSet.variants).toHaveLength(1)
  })

  it("drops a draft saved before 101 (its details were a type's attributes)", () => {
    window.localStorage.setItem(draftKey("shop-1", "sub-a"), JSON.stringify({ name: "Old", attributes: {} }))
    expect(loadDraft("shop-1", "sub-a")).toBeNull()
  })

  it("clears a draft on publish/discard", () => {
    saveDraft("shop-1", "sub-a", emptyDraft())
    clearDraft("shop-1", "sub-a")
    expect(loadDraft("shop-1", "sub-a")).toBeNull()
  })
})
