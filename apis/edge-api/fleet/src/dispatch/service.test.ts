import { describe, expect, it, vi } from "vitest";

// Only the database is replaced.
const rows = vi.hoisted(() => ({ candidates: [] as unknown[] }));
vi.mock("../planner/repository", () => ({
  loadCandidates: async () => rows.candidates,
}));

import { DispatchError } from "./service";

describe("DispatchError — refusals carry their reason (FR-034)", () => {
  it("names the condition rather than collapsing to a generic message", () => {
    const e = new DispatchError("ineligible", "That driver cannot take this round.", [
      "licence_expired",
      "no_vehicle",
    ]);
    expect(e.kind).toBe("ineligible");
    // The reasons must survive as data, not prose: the api-client throws a plain object.
    expect(e.reasons).toEqual(["licence_expired", "no_vehicle"]);
  });

  it("distinguishes a stale write from a missing one", () => {
    expect(new DispatchError("stale", "x").kind).toBe("stale");
    expect(new DispatchError("not_found", "x").kind).toBe("not_found");
  });

  it("defaults to no reasons, so a non-eligibility refusal carries none", () => {
    expect(new DispatchError("invalid", "x").reasons).toEqual([]);
  });
});
