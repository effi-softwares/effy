import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  readZone: vi.fn(),
  getAreaDecision: vi.fn(),
  areaServiceLevels: vi.fn(),
  localitiesForPostcode: vi.fn(),
  projectAreaServiceLevels: vi.fn(),
  recordAreaDecision: vi.fn(),
  shopsForArea: vi.fn(),
  zonePostcodes: vi.fn(),
}));
vi.mock("./repository", () => repo);

import { getArea, markAreaNotServed } from "./areas";
import { isDeliveryError } from "./types";

const ZONE = { id: "z1", code: "REGIONAL", name: "Regional", status: "active" };
const BALLARAT = [{ name: "Alfredton", state: "VIC", postcode: "3350" }];

const kindOf = async (p: Promise<unknown>) =>
  p.then(() => "none").catch((e) => (isDeliveryError(e) ? e.kind : "unknown"));

beforeEach(() => {
  vi.resetAllMocks();
  repo.readZone.mockResolvedValue(ZONE);
  repo.getAreaDecision.mockResolvedValue(null);
  repo.areaServiceLevels.mockResolvedValue([]);
  repo.localitiesForPostcode.mockResolvedValue(BALLARAT);
  repo.shopsForArea.mockResolvedValue([]);
  repo.zonePostcodes.mockResolvedValue(["3350"]);
});

/* ── The three states (FR-012, SC-005) ────────────────────────────────────────────────────────── */

describe("getArea — the three states", () => {
  /**
   * ⚠ THE REGIONAL CLASS. No decision, nothing offered — and before this feature that was
   * indistinguishable from "deliberately not served". Those shoppers were told "we deliver here" and
   * could not check out, and nobody could tell whether it was a choice or an oversight.
   */
  it("reports an area nobody has decided about as UNCONFIGURED", async () => {
    const area = await getArea("z1", "3350");
    expect(area.state).toBe("unconfigured");
    expect(area.decision).toBeNull();
  });

  it("reports a deliberately unserved area as NOT_SERVED, with its provenance", async () => {
    repo.getAreaDecision.mockResolvedValue({
      decision: "not_served",
      note: "No capacity until Q3",
      decidedBy: "sub-abc",
      decidedAt: "2026-08-01T00:00:00.000Z",
    });

    const area = await getArea("z1", "3350");
    expect(area.state).toBe("not_served");
    expect(area.decision?.note).toBe("No capacity until Q3");
    expect(area.decision?.decidedBy).toBe("sub-abc");
  });

  it("reports an area with an active offering as CONFIGURED", async () => {
    repo.areaServiceLevels.mockResolvedValue([
      { method: "standard", enabled: true, feeAmount: "5.00", leadDaysMin: 2, leadDaysMax: 3, sameDayCutoff: null, distinctFees: ["5.00"] },
    ]);

    const area = await getArea("z1", "3350");
    expect(area.state).toBe("configured");
  });

  /** ⚠ SC-005: every area resolves to exactly one of three states. None is ambiguous. */
  it("never leaves an area in two states at once", async () => {
    const area = await getArea("z1", "3350");
    expect(["configured", "not_served", "unconfigured"]).toContain(area.state);
  });

  /** FR-023: an area is shown by the places it covers, not only by four digits. */
  it("carries the places the postcode covers", async () => {
    const area = await getArea("z1", "3350");
    expect(area.places).toEqual([{ name: "Alfredton", state: "VIC" }]);
  });

  /** ⚠ FR-029: every platform method is present, so none can be silently dropped from the UI. */
  it("returns a row for every delivery method the platform supports", async () => {
    const area = await getArea("z1", "3350");
    expect(area.serviceLevels.map((l) => l.method).sort()).toEqual([
      "same_day",
      "scheduled",
      "standard",
    ]);
  });
});

/* ── "Not served" must actually stop serving (FR-011a) ────────────────────────────────────────── */

describe("markAreaNotServed", () => {
  /**
   * ⚠ THE FIX FOR A DESIGN DEFECT CAUGHT BEFORE IMPLEMENTATION.
   *
   * The first draft of this feature only RECORDED the decision. Serviceability is decided by zone
   * membership, so an area marked "not served" would have carried on answering {"serviced":true} to
   * the storefront — the REGIONAL defect inverted, introduced by the feature meant to prevent it. The
   * repository does both in one transaction; this asserts the service asks for it.
   */
  it("records the decision so the area is withdrawn, not merely annotated", async () => {
    await markAreaNotServed("z1", "3350", { note: "No capacity until Q3" }, "sub-abc");

    expect(repo.recordAreaDecision).toHaveBeenCalledWith(
      "z1",
      "3350",
      "not_served",
      "No capacity until Q3",
      "sub-abc",
    );
  });

  it("accepts a decision with no note", async () => {
    await markAreaNotServed("z1", "3350", {}, "sub-abc");
    expect(repo.recordAreaDecision).toHaveBeenCalledWith("z1", "3350", "not_served", null, "sub-abc");
  });

  it("treats a blank note as no note", async () => {
    await markAreaNotServed("z1", "3350", { note: "   " }, "sub-abc");
    expect(repo.recordAreaDecision).toHaveBeenCalledWith("z1", "3350", "not_served", null, "sub-abc");
  });

  it("rejects something that is not a postcode", async () => {
    expect(await kindOf(markAreaNotServed("z1", "banana", {}, "sub"))).toBe("validation");
    expect(repo.recordAreaDecision).not.toHaveBeenCalled();
  });
});

/* ── ⚠ The zone-vs-area granularity gap (data-model §consequence 3) ───────────────────────────── */

describe("two areas in ONE zone with divergent decisions", () => {
  /**
   * ⚠ THIS IS THE CASE THE DESIGN CANNOT FULLY EXPRESS, TESTED RATHER THAN HIDDEN.
   *
   * The decision record is AREA-granular (`zone_id` + `postcode`), but `delivery_offering` is
   * ZONE-granular. So two areas in one zone share every offering while holding different decisions.
   *
   * What MUST hold — and does — is that `getArea` reports them differently, because the decision is
   * what determines the state. What CANNOT hold is that their offerings differ: configuring Ballarat
   * configures Bendigo too, which is why the editor has to disclose it (T036).
   *
   * Recorded here rather than papered over, because a reader who finds this behaviour later deserves
   * to know it was a known limit rather than an accident.
   */
  const SHARED_OFFERINGS = [
    {
      method: "standard" as const,
      enabled: true,
      feeAmount: "8.00",
      leadDaysMin: 2,
      leadDaysMax: 3,
      sameDayCutoff: null,
      distinctFees: ["8.00"],
    },
  ];

  it("reports each area's OWN decision, even though they share a zone's offerings", async () => {
    repo.areaServiceLevels.mockResolvedValue(SHARED_OFFERINGS);
    repo.localitiesForPostcode.mockResolvedValue([{ name: "Bendigo", state: "VIC", postcode: "3550" }]);

    // Ballarat: no decision → configured, because the zone has an active offering.
    repo.getAreaDecision.mockResolvedValue(null);
    const ballarat = await getArea("z1", "3350");

    // Bendigo: explicitly not served → not_served WINS over the shared active offering.
    repo.getAreaDecision.mockResolvedValue({
      decision: "not_served",
      note: null,
      decidedBy: "sub-abc",
      decidedAt: "2026-08-01T00:00:00.000Z",
    });
    const bendigo = await getArea("z1", "3550");

    expect(ballarat.state).toBe("configured");
    expect(bendigo.state).toBe("not_served");
  });

  /**
   * ⚠ THE LIMIT, ASSERTED SO IT IS NOT MISTAKEN FOR A BUG LATER.
   *
   * Both areas necessarily report the SAME service levels, because the grid is keyed on zone. An
   * admin configuring one has configured the other, and the interface must say so. Fixing this means
   * re-keying `delivery_offering` on postcode — a rewrite of the quoting path, explicitly out of
   * scope (FR-028).
   */
  it("⚠ necessarily reports the SAME service levels for both — the known zone-granularity limit", async () => {
    repo.areaServiceLevels.mockResolvedValue(SHARED_OFFERINGS);
    repo.getAreaDecision.mockResolvedValue(null);

    const ballarat = await getArea("z1", "3350");
    const bendigo = await getArea("z1", "3550");

    const feeFor = (a: typeof ballarat) =>
      a.serviceLevels.find((l) => l.method === "standard")?.feeAmount;
    expect(feeFor(ballarat)).toBe(feeFor(bendigo));
  });
});

/* ⚠ The projection, same-day guard and one-fee invariant tests were REMOVED with the code they
 * covered (2026-08-01). See the note at the top of areas.ts: the per-area pricing collapse is
 * contradicted by shop-declared same-day eligibility, and the zone-membership heuristic the guard
 * relied on was disproven at 98 km. Their replacements belong to the next slice, over real distance.
 */
