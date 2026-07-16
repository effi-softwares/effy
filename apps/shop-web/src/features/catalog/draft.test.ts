import { beforeEach, describe, expect, it } from "vitest";

import { clearDraft, draftKey, emptyDraft, loadDraft, saveDraft } from "./draft";

// FR-012: the device-local create draft survives a closed dialog / refresh, is keyed per shop+subject,
// and never throws on a malformed or missing blob.
describe("catalog draft store", () => {
  beforeEach(() => window.localStorage.clear());

  it("keys the draft per shop AND subject", () => {
    expect(draftKey("shop-1", "sub-a")).not.toBe(draftKey("shop-2", "sub-a"));
    expect(draftKey("shop-1", "sub-a")).not.toBe(draftKey("shop-1", "sub-b"));
  });

  it("round-trips a saved draft", () => {
    const draft = { ...emptyDraft(), step: 2, name: "Flat White", priceAmount: "4.50" };
    saveDraft("shop-1", "sub-a", draft);
    expect(loadDraft("shop-1", "sub-a")).toEqual(draft);
  });

  it("isolates drafts between operators sharing a browser", () => {
    saveDraft("shop-1", "sub-a", { ...emptyDraft(), name: "A's product" });
    saveDraft("shop-1", "sub-b", { ...emptyDraft(), name: "B's product" });
    expect(loadDraft("shop-1", "sub-a")?.name).toBe("A's product");
    expect(loadDraft("shop-1", "sub-b")?.name).toBe("B's product");
  });

  it("returns null when there is no draft", () => {
    expect(loadDraft("shop-1", "sub-a")).toBeNull();
  });

  it("treats a malformed blob as no draft (never throws)", () => {
    window.localStorage.setItem(draftKey("shop-1", "sub-a"), "{not json");
    expect(loadDraft("shop-1", "sub-a")).toBeNull();
  });

  it("merges a partial/legacy blob over a fresh draft (no undefined fields)", () => {
    window.localStorage.setItem(draftKey("shop-1", "sub-a"), JSON.stringify({ name: "Old" }));
    const loaded = loadDraft("shop-1", "sub-a");
    expect(loaded?.name).toBe("Old");
    expect(loaded?.attributes).toEqual({});
    expect(loaded?.priceAmount).toBe("");
  });

  it("clears a draft on publish/discard", () => {
    saveDraft("shop-1", "sub-a", emptyDraft());
    clearDraft("shop-1", "sub-a");
    expect(loadDraft("shop-1", "sub-a")).toBeNull();
  });
});
