import { describe, expect, it } from "vitest";

import { itemChangeId } from "./change-id";

describe("itemChangeId", () => {
  // ⚠ THESE EXPECTED VALUES WERE COMPUTED BY THE RETIRED GO BACKEND (uuid.NewSHA1 over the same
  // namespace and name) before it was removed. They are the proof that a bulk add-to-cart retried
  // across the cut-over derives the SAME per-item ids and therefore adds nothing twice. If this
  // test is ever "fixed" by changing the expectations, that guarantee is gone.
  it.each([
    ["batch-1", "a", "0c9d79ee-3a09-5187-9977-493fc70f3ef3"],
    ["3f2c1b0a-0000-4000-8000-000000000001", "00000000-0000-0000-0000-000000000001", "faa9be4f-59d4-51bc-a5b8-49b303ad3387"],
    ["", "x", "9b719c04-12c4-5a30-b33d-c08af1d1be7f"],
  ])("(%j, %j) → %s — byte-identical to the derivation in use before 070", (changeId, productId, want) => {
    expect(itemChangeId(changeId, productId)).toBe(want);
  });

  it("is a version-5 uuid, so it fits the cart's uuid change-id column", () => {
    expect(itemChangeId("batch-1", "a")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("is stable for one request and distinct per item and per request", () => {
    expect(itemChangeId("batch-1", "a")).toBe(itemChangeId("batch-1", "a"));
    expect(itemChangeId("batch-1", "a")).not.toBe(itemChangeId("batch-1", "b"));
    expect(itemChangeId("batch-1", "a")).not.toBe(itemChangeId("batch-2", "a"));
  });
});
