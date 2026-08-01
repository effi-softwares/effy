import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  listDeclarations: vi.fn(),
  getDeclaration: vi.fn(),
  approveDeclaration: vi.fn(),
  declineDeclaration: vi.fn(),
  revokeDeclaration: vi.fn(),
}));
vi.mock("./approvals-repository", () => repo);

import { approve, decline, getDeclaration, listDeclarations, revoke } from "./approvals";
import { isDeliveryError } from "./types";
// ⚠ From ./distance, which is NOT mocked — pure arithmetic, and the point is to pin the real numbers.
import { greatCircleKm } from "./distance";

async function refusalOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "no-throw";
  } catch (e) {
    if (!isDeliveryError(e)) return "other";
    return e.code ?? e.kind;
  }
}

const REVIEW = { id: "d1", shopId: "s1", areas: [], furthestKm: null };

beforeEach(() => {
  vi.resetAllMocks();
  repo.getDeclaration.mockResolvedValue(REVIEW);
  repo.listDeclarations.mockResolvedValue([]);
});

describe("the queue", () => {
  // ⚠ FR-027 — a declaration waiting on a person must be visible, not silently queued. Defaulting to
  // pending is what makes "is anything waiting?" the first question this endpoint answers.
  it("defaults to what is awaiting a decision", async () => {
    await listDeclarations();
    expect(repo.listDeclarations).toHaveBeenCalledWith("pending");
  });

  it("accepts an explicit status, and 'all'", async () => {
    await listDeclarations("approved");
    expect(repo.listDeclarations).toHaveBeenCalledWith("approved");
    await listDeclarations("all");
    expect(repo.listDeclarations).toHaveBeenLastCalledWith(null);
  });

  it("falls back to pending for an unknown status rather than returning everything", async () => {
    await listDeclarations("nonsense");
    expect(repo.listDeclarations).toHaveBeenCalledWith("pending");
  });

  it("404s an unknown declaration", async () => {
    repo.getDeclaration.mockResolvedValue(null);
    expect(await refusalOf(getDeclaration("nope"))).toBe("not_found");
  });
});

describe("decisions", () => {
  it("approves, passing the actor for the audit row", async () => {
    await approve("d1", {}, "admin-42");
    expect(repo.approveDeclaration).toHaveBeenCalledWith("d1", "admin-42", null);
  });

  it("carries an optional approval note", async () => {
    await approve("d1", { note: "  Close enough.  " }, "a");
    expect(repo.approveDeclaration).toHaveBeenCalledWith("d1", "a", "Close enough.");
  });

  // ⚠ FR-024. A decline with no reason tells a shop only that Effy said no — so they resubmit the
  // same thing, or quietly stop asking. The case this feature exists for is exactly the one where the
  // words matter: "Ballarat is 98 km away" is actionable; silence is not.
  it("REFUSES a decline with no reason", async () => {
    expect(await refusalOf(decline("d1", {}, "a"))).toBe("reason_required");
    expect(await refusalOf(decline("d1", { note: "   " }, "a"))).toBe("reason_required");
    expect(repo.declineDeclaration).not.toHaveBeenCalled();
  });

  it("declines with a reason", async () => {
    await decline("d1", { note: "Ballarat is 98 km away." }, "a");
    expect(repo.declineDeclaration).toHaveBeenCalledWith("d1", "a", "Ballarat is 98 km away.");
  });

  // ⚠ Revocation takes away something the shop already HAD, which needs more explanation than
  // refusing something they asked for, not less.
  it("REFUSES a revoke with no reason", async () => {
    expect(await refusalOf(revoke("d1", {}, "a"))).toBe("reason_required");
    expect(repo.revokeDeclaration).not.toHaveBeenCalled();
  });

  it("revokes with a reason", async () => {
    await revoke("d1", { note: "Van off the road." }, "a");
    expect(repo.revokeDeclaration).toHaveBeenCalledWith("d1", "a", "Van off the road.");
  });

  it("returns the refreshed declaration after every decision", async () => {
    expect(await approve("d1", {}, "a")).toEqual(REVIEW);
    expect(await decline("d1", { note: "x" }, "a")).toEqual(REVIEW);
    expect(await revoke("d1", { note: "x" }, "a")).toEqual(REVIEW);
  });
});

// ── The distance arithmetic (SC-008) ──────────────────────────────────────────────────────────
//
// ⚠ These are the numbers the approval screen shows an admin, and the reason this feature exists.
// 031's guard asked "is any shop in this area's zone?" — so same-day to Ballarat was permitted by a
// shop in Bendigo, which is as far away as Melbourne. The check reported "a shop is nearby" and
// carried no information at all.
describe("greatCircleKm", () => {
  const ballarat = [-37.5622, 143.8503] as const;
  const bendigo = [-36.757, 144.2794] as const;
  const melbourne = [-37.8142, 144.9632] as const;

  it("⚠ Bendigo is ~98 km from Ballarat — as far as Melbourne", () => {
    const bb = greatCircleKm(ballarat[0], ballarat[1], bendigo[0], bendigo[1])!;
    const bm = greatCircleKm(ballarat[0], ballarat[1], melbourne[0], melbourne[1])!;
    expect(bb).toBeGreaterThan(95);
    expect(bb).toBeLessThan(101);
    expect(Math.abs(bb - bm)).toBeLessThan(20);
  });

  // ⚠ TWO IMPLEMENTATIONS OF ONE FORMULA — here and in core-api's distance.go — because the cold path
  // cannot call the hot path (core-api has no cloud deployment, so it would work locally and fail in
  // dev). That duplication is only safe if they agree, so these pin the SAME reference pairs the Go
  // tests use, to the same tolerance. A drift between them would mean an admin approves against one
  // number and a shopper is priced against another.
  it("agrees with the Go implementation in core-api", () => {
    // distance_test.go: Melbourne→Geelong 64 ± 3 (both compute 64.6), Melbourne→Ballarat 105 ± 4.
    expect(greatCircleKm(melbourne[0], melbourne[1], -38.1499, 144.3617)!).toBeCloseTo(64.6, 1);
    expect(greatCircleKm(melbourne[0], melbourne[1], ballarat[0], ballarat[1])!).toBeGreaterThan(101);
    expect(greatCircleKm(melbourne[0], melbourne[1], ballarat[0], ballarat[1])!).toBeLessThan(109);
  });

  // ⚠ THE ONE THAT MATTERS. A zero would place the area next door to the shop on the one screen whose
  // entire purpose is to show how far away it is — the most dangerous possible default, because it
  // argues FOR approval.
  it("returns NULL, never 0, when either end is unknown", () => {
    expect(greatCircleKm(null, null, melbourne[0], melbourne[1])).toBeNull();
    expect(greatCircleKm(melbourne[0], melbourne[1], null, null)).toBeNull();
    expect(greatCircleKm(melbourne[0], null, melbourne[0], melbourne[1])).toBeNull();
  });

  it("is symmetric and zero for the same point", () => {
    const ab = greatCircleKm(melbourne[0], melbourne[1], bendigo[0], bendigo[1]);
    const ba = greatCircleKm(bendigo[0], bendigo[1], melbourne[0], melbourne[1]);
    expect(ab).toBe(ba);
    expect(greatCircleKm(melbourne[0], melbourne[1], melbourne[0], melbourne[1])).toBe(0);
  });
});
