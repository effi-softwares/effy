import { describe, expect, it } from "vitest";

import {
  eligibilityReasons,
  pickByLoad,
  type CandidateDriver,
  type EligibilityInput,
  type WorkUnit,
} from "./driver-eligibility";

const NOW = new Date("2026-09-21T02:00:00Z"); // midday Melbourne

function driver(p: Partial<CandidateDriver> = {}): CandidateDriver {
  return {
    driverId: "d1",
    status: "active",
    onDuty: true,
    licenceExpiresOn: "2030-01-01",
    expectedEndAt: null,
    vehicle: { vehicleId: "v1", payloadKg: 900, canCarryChilled: true, canCarryFrozen: true },
    clearances: [{ function: "collection", zoneId: "zone-1" }],
    packagesAssignedToday: 0,
    ...p,
  };
}

function work(p: Partial<WorkUnit> = {}): WorkUnit {
  return {
    function: "collection",
    zoneId: "zone-1",
    totalWeightGrams: 10_000,
    requiresChilled: false,
    requiresFrozen: false,
    stopCount: 3,
    deadlineAt: new Date(NOW.getTime() + 4 * 3600_000),
    ...p,
  };
}

const ask = (p: Partial<EligibilityInput> = {}) =>
  eligibilityReasons({ driver: driver(), work: work(), now: NOW, perStopAllowanceMin: 12, ...p });

describe("eligibilityReasons — hard gates (FR-009, FR-010)", () => {
  it("returns nothing for a driver who may do the work", () => {
    expect(ask()).toEqual([]);
  });

  it.each(["suspended", "offboarded"] as const)("refuses a %s driver", (status) => {
    expect(ask({ driver: driver({ status }) })).toContain("not_employable");
  });

  it("refuses a driver who is not on duty", () => {
    expect(ask({ driver: driver({ onDuty: false }) })).toContain("not_on_duty");
  });

  it("refuses an expired licence but accepts one with no expiry recorded", () => {
    expect(ask({ driver: driver({ licenceExpiresOn: "2020-01-01" }) })).toContain("licence_expired");
    expect(ask({ driver: driver({ licenceExpiresOn: null }) })).not.toContain("licence_expired");
  });

  it("refuses a driver holding no vehicle", () => {
    expect(ask({ driver: driver({ vehicle: null }) })).toContain("no_vehicle");
  });

  it("refuses work the driver is not cleared for — the wrong area, or the wrong function", () => {
    expect(ask({ work: work({ zoneId: "zone-9" }) })).toContain("not_cleared");
    expect(ask({ work: work({ function: "delivery" }) })).toContain("not_cleared");
  });

  // 082 P5 — a postcode filed under no group is not a place nobody may go.
  it("082 — work in NO area is cleared by any clearance for that function, and by none for another", () => {
    // The fixture driver collects in zone-1 only.
    expect(ask({ work: work({ zoneId: null }) })).not.toContain("not_cleared");
    expect(ask({ work: work({ zoneId: null, function: "delivery" }) })).toContain("not_cleared");
    const none = driver({ clearances: [] });
    expect(ask({ driver: none, work: work({ zoneId: null }) })).toContain("not_cleared");
  });

  // ⚠ 062 FR-011 — the single most important line of the matching rule.
  it("treats a null-zone clearance as EVERY zone, including one that did not exist at grant time", () => {
    const everywhere = driver({ clearances: [{ function: "collection", zoneId: null }] });
    expect(ask({ driver: everywhere, work: work({ zoneId: "zone-created-yesterday" }) })).toEqual([]);
  });

  it("refuses refrigerated goods to a vehicle that cannot carry them", () => {
    const warm = driver({ vehicle: { vehicleId: "v2", payloadKg: 900, canCarryChilled: false, canCarryFrozen: false } });
    expect(ask({ driver: warm, work: work({ requiresChilled: true }) })).toContain("no_refrigeration");
    expect(ask({ driver: warm, work: work({ requiresFrozen: true }) })).toContain("no_refrigeration");
  });

  it("refuses a round heavier than the vehicle's payload", () => {
    expect(ask({ work: work({ totalWeightGrams: 900_001 }) })).toContain("over_capacity");
    expect(ask({ work: work({ totalWeightGrams: 900_000 }) })).not.toContain("over_capacity");
  });

  // R8 — the limitation is deliberate and must stay visible.
  it("does not gate on volume or crates, because the catalogue has no product volume", () => {
    const noPayload = driver({ vehicle: { vehicleId: "v3", payloadKg: null, canCarryChilled: true, canCarryFrozen: true } });
    expect(ask({ driver: noPayload, work: work({ totalWeightGrams: 10_000_000 }) })).not.toContain("over_capacity");
  });

  it("refuses a round that cannot finish before its deadline", () => {
    const soon = work({ stopCount: 20, deadlineAt: new Date(NOW.getTime() + 30 * 60_000) });
    expect(ask({ work: soon })).toContain("cannot_meet_deadline");
  });

  it("refuses a round that would run past the driver's stated finish time", () => {
    const leavingSoon = driver({ expectedEndAt: new Date(NOW.getTime() + 20 * 60_000).toISOString() });
    expect(ask({ driver: leavingSoon })).toContain("cannot_meet_deadline");
  });

  // ⚠ FR-026 — sending an operator to fix one of three problems wastes the trip.
  it("returns EVERY failing condition, not the first", () => {
    const hopeless = driver({ status: "suspended", onDuty: false, licenceExpiresOn: "2020-01-01", vehicle: null });
    const reasons = ask({ driver: hopeless });
    expect(reasons).toEqual(
      expect.arrayContaining(["not_employable", "not_on_duty", "licence_expired", "no_vehicle"]),
    );
    expect(reasons.length).toBeGreaterThanOrEqual(4);
  });

  // ⚠ FR-015 / FR-034 both need the reason as data; a throw would make an ordinary outcome an error.
  it("never throws for an ineligible driver — it returns reasons", () => {
    expect(() => ask({ driver: driver({ status: "offboarded", vehicle: null }) })).not.toThrow();
  });
});

describe("eligibilityReasons — work that cannot be started yet (072)", () => {
  // A round for a run four hours off, which opens 45 minutes before it.
  const deadlineAt = new Date(NOW.getTime() + 4 * 3600_000);
  const opensAt = new Date(deadlineAt.getTime() - 45 * 60_000);

  it("is unchanged when no start time is given", () => {
    expect(ask({ work: work({ stopCount: 10, deadlineAt }) })).toEqual([]);
  });

  // ⚠ The point of the field. Four hours from now fits twenty stops; forty-five minutes fits three.
  it("judges the finish from when the work OPENS, not from when it was planned", () => {
    expect(ask({ work: work({ stopCount: 3, deadlineAt }), startAt: opensAt })).toEqual([]);
    expect(ask({ work: work({ stopCount: 4, deadlineAt }), startAt: opensAt })).toContain("cannot_meet_deadline");
  });

  it("refuses a driver whose stated finish is before the work opens", () => {
    const goesHomeFirst = driver({ expectedEndAt: new Date(opensAt.getTime() - 60_000).toISOString() });
    expect(ask({ driver: goesHomeFirst, work: work({ stopCount: 1, deadlineAt }), startAt: opensAt })).toContain(
      "cannot_meet_deadline",
    );
  });

  it("never starts earlier than now — a round that opened an hour ago starts from the present", () => {
    const opened = new Date(NOW.getTime() - 3600_000);
    const tight = work({ stopCount: 3, deadlineAt: new Date(NOW.getTime() + 30 * 60_000) });
    expect(ask({ work: tight, startAt: opened })).toContain("cannot_meet_deadline");
  });

  it("still judges the licence at now, not at the opening time", () => {
    const expiresTonight = driver({ licenceExpiresOn: "2026-09-21" });
    expect(ask({ driver: expiresTonight, work: work({ stopCount: 1, deadlineAt }), startAt: opensAt })).toEqual([]);
  });
});

describe("pickByLoad — choosing between eligible drivers (FR-014)", () => {
  const cand = (driverId: string, packagesAssignedToday: number) => ({ driverId, packagesAssignedToday });

  it("gives the work to the driver carrying the fewest packages today", () => {
    expect(pickByLoad([cand("busy", 9), cand("light", 1), cand("mid", 4)])!.driverId).toBe("light");
  });

  // ⚠ FR-014 — an arbitrary pick makes the planner untestable and "why?" unanswerable.
  it("breaks a tie stably, not arbitrarily", () => {
    const a = pickByLoad([cand("zoe", 2), cand("amy", 2)])!.driverId;
    const b = pickByLoad([cand("amy", 2), cand("zoe", 2)])!.driverId;
    expect(a).toBe("amy");
    expect(a).toBe(b);
  });

  it("returns null when nobody is eligible", () => {
    expect(pickByLoad([])).toBeNull();
  });

  it("does not mutate its input", () => {
    const input = [cand("b", 5), cand("a", 1)];
    pickByLoad(input);
    expect(input.map((c) => c.driverId)).toEqual(["b", "a"]);
  });
});
