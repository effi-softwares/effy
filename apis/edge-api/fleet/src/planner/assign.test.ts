import { describe, expect, it } from "vitest";

import { planWave, type AssignInput } from "./assign";
import type { BucketRound, PlannablePackage, PlannerCandidate } from "./types";

const NOW = new Date("2026-07-15T02:00:00Z"); // midday Melbourne
const DEADLINE = new Date("2026-07-15T03:00:00Z"); // 13:00 Melbourne

function pkg(p: Partial<PlannablePackage> & { packageId: string }): PlannablePackage {
  return {
    orderNumber: "EFY-1",
    shopId: "shop-1",
    shopName: "Shop One",
    address: "1 Test St, Fitzroy, VIC, 3065",
    orderId: null,
    recipientName: null,
    method: "standard",
    zoneId: "zone-1",
    zoneName: "Inner North",
    readySince: "2026-07-15T01:00:00Z",
    weightGrams: 1000,
    itemCount: 2,
    requiresChilled: false,
    requiresFrozen: false,
    windowStart: null,
    windowEnd: null,
    ...p,
  };
}

function driver(p: Partial<PlannerCandidate> & { driverId: string }): PlannerCandidate {
  return {
    driverName: "Driver",
    status: "active",
    onDuty: true,
    licenceExpiresOn: "2030-01-01",
    expectedEndAt: null,
    vehicle: { vehicleId: "v1", payloadKg: 900, canCarryChilled: true, canCarryFrozen: true },
    clearances: [{ function: "collection", method: "standard", zoneId: "zone-1" }],
    packagesAssignedToday: 0,
    ...p,
  };
}

function plan(over: Partial<AssignInput> = {}) {
  return planWave({
    kind: "collection",
    packages: [pkg({ packageId: "p1" })],
    candidates: [driver({ driverId: "d1" })],
    plannedFor: NOW,
    deadlineAt: DEADLINE,
    now: NOW,
    perStopAllowanceMin: 12,
    ...over,
  });
}

describe("planWave — placing work (US1)", () => {
  it("gives ready work to an eligible on-duty driver", () => {
    const out = plan();
    expect(out.assignments.get("d1")?.map((p) => p.packageId)).toEqual(["p1"]);
    expect(out.unassigned).toEqual([]);
    expect(out.considered).toBe(1);
  });

  // ⚠ FR-015 / SC-003 — the engine may fail to assign; it may never fail quietly.
  it("leaves work unassigned WITH A REASON when nobody is cleared for it", () => {
    const out = plan({ packages: [pkg({ packageId: "p1", zoneId: "zone-9" })] });
    expect(out.unassigned.map((p) => p.packageId)).toEqual(["p1"]);
    expect(out.exclusions.some((e) => e.reason === "not_cleared" && e.driverId === "d1")).toBe(true);
  });

  it("records `driverId: null` when there was no candidate at all — a different, more urgent problem", () => {
    const out = plan({ candidates: [] });
    expect(out.unassigned).toHaveLength(1);
    expect(out.exclusions).toEqual([{ packageId: "p1", driverId: null, reason: "not_on_duty" }]);
  });

  it("refuses a driver who is off duty, stood down, unlicensed or holding no vehicle", () => {
    for (const bad of [
      driver({ driverId: "d1", onDuty: false }),
      driver({ driverId: "d1", status: "suspended" }),
      driver({ driverId: "d1", licenceExpiresOn: "2020-01-01" }),
      driver({ driverId: "d1", vehicle: null }),
    ]) {
      const out = plan({ candidates: [bad] });
      expect(out.assignments.size).toBe(0);
      expect(out.exclusions.length).toBeGreaterThan(0);
    }
  });

  // ⚠ FR-014 / SC-007a — the operator's decision, made testable.
  it("gives the next package to the driver carrying the fewest today", () => {
    const out = plan({
      candidates: [
        driver({ driverId: "busy", packagesAssignedToday: 7 }),
        driver({ driverId: "light", packagesAssignedToday: 1 }),
      ],
    });
    expect(out.assignments.has("light")).toBe(true);
    expect(out.assignments.has("busy")).toBe(false);
  });

  // ⚠ Without counting the wave's own assignments, one driver takes everything in a single pass.
  it("counts work placed earlier in the SAME wave when balancing", () => {
    const out = plan({
      packages: [pkg({ packageId: "p1" }), pkg({ packageId: "p2" }), pkg({ packageId: "p3", shopId: "shop-2" })],
      candidates: [driver({ driverId: "a" }), driver({ driverId: "b" })],
    });
    const a = out.assignments.get("a")?.length ?? 0;
    const b = out.assignments.get("b")?.length ?? 0;
    expect(a + b).toBe(3);
    expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
  });

  it("refuses a round heavier than the vehicle can carry, and says so", () => {
    const out = plan({
      packages: [pkg({ packageId: "p1", weightGrams: 900_001 })],
      candidates: [driver({ driverId: "d1" })],
    });
    expect(out.unassigned).toHaveLength(1);
    expect(out.exclusions.some((e) => e.reason === "over_capacity")).toBe(true);
  });

  it("sends refrigerated goods only to a capable vehicle", () => {
    const warm = driver({
      driverId: "warm",
      vehicle: { vehicleId: "v2", payloadKg: 900, canCarryChilled: false, canCarryFrozen: false },
    });
    const cold = driver({ driverId: "cold" });
    const out = plan({ packages: [pkg({ packageId: "p1", requiresFrozen: true })], candidates: [warm, cold] });
    expect(out.assignments.has("cold")).toBe(true);
    expect(out.assignments.has("warm")).toBe(false);
  });

  // ⚠ 062 FR-011 — a clearance for "everywhere" must survive a zone created afterwards.
  it("treats a null-zone clearance as every zone, including a brand-new one", () => {
    const everywhere = driver({
      driverId: "d1",
      clearances: [{ function: "collection", method: "standard", zoneId: null }],
    });
    const out = plan({ packages: [pkg({ packageId: "p1", zoneId: "zone-created-today" })], candidates: [everywhere] });
    expect(out.assignments.has("d1")).toBe(true);
  });

  it("places the longest-waiting work first", () => {
    const out = plan({
      packages: [
        pkg({ packageId: "newest", readySince: "2026-07-15T01:50:00Z" }),
        pkg({ packageId: "oldest", readySince: "2026-07-15T00:10:00Z" }),
      ],
      candidates: [driver({ driverId: "d1" })],
    });
    // The gather query orders by readiness; the planner must not reshuffle it.
    expect(out.assignments.get("d1")?.map((p) => p.packageId)).toEqual(["newest", "oldest"]);
  });
});

/** A round that already exists for the run being planned. */
function round(p: Partial<BucketRound> & { roundId: string; driverId: string }): BucketRound {
  return { status: "planned", weightGrams: 0, stops: [], ...p };
}

describe("planWave — a package that becomes ready mid-round (FR-004a)", () => {
  const underWay = [
    round({ roundId: "r1", driverId: "d1", status: "in_progress", stops: [{ key: "shop-1", outstanding: true }] }),
  ];

  it("joins the round when that shop's stop is still outstanding", () => {
    const out = plan({ rounds: underWay });
    expect(out.additions.get("r1")?.map((p) => p.packageId)).toEqual(["p1"]);
    expect(out.assignments.size).toBe(0);
  });

  // ⚠ A locked round is never LOADED (the query excludes it), so the planner is simply not shown it.
  it("does NOT join a round a dispatcher has locked — it is never shown one", () => {
    const out = plan({ rounds: [] });
    expect(out.additions.size).toBe(0);
    expect(out.assignments.has("d1")).toBe(true);
  });

  // ⚠ FR-004c — the fix for one problem must not create another.
  it("refuses the late join when it would breach capacity, and records why", () => {
    const out = plan({
      packages: [pkg({ packageId: "heavy", weightGrams: 900_001 })],
      rounds: underWay,
    });
    expect(out.additions.size).toBe(0);
    expect(out.exclusions.some((e) => e.reason === "over_capacity")).toBe(true);
  });

  it("starts a further round when that shop's stop is already done", () => {
    const done = [
      round({ roundId: "r1", driverId: "d1", status: "in_progress", stops: [{ key: "shop-1", outstanding: false }] }),
    ];
    const out = plan({ rounds: done });
    expect(out.additions.size).toBe(0);
    expect(out.assignments.has("d1")).toBe(true);
  });

  // The package is at the hub; a delivery round under way has left it.
  it("never joins a DELIVERY round that is under way", () => {
    const out = plan({
      kind: "delivery",
      packages: [pkg({ packageId: "p1", method: "same_day", orderId: "order-1" })],
      candidates: [driver({ driverId: "d1", clearances: [{ function: "delivery", method: "same_day", zoneId: "zone-1" }] })],
      rounds: [round({ roundId: "r1", driverId: "d1", status: "in_progress", stops: [{ key: "order-1", outstanding: true }] })],
    });
    expect(out.additions.size).toBe(0);
    expect(out.assignments.get("d1")?.map((p) => p.packageId)).toEqual(["p1"]);
  });
});

describe("planWave — one round per driver per run (072, US3)", () => {
  it("adds to the driver's not-yet-begun round instead of starting another", () => {
    const out = plan({
      packages: [pkg({ packageId: "p2", shopId: "shop-2" })],
      rounds: [round({ roundId: "r1", driverId: "d1", stops: [{ key: "shop-1", outstanding: true }] })],
    });
    expect(out.additions.get("r1")?.map((p) => p.packageId)).toEqual(["p2"]);
    expect(out.assignments.size).toBe(0);
  });

  it("puts a package for a shop already on a planned round on THAT round, whoever is emptier", () => {
    const out = plan({
      candidates: [driver({ driverId: "busy", packagesAssignedToday: 9 }), driver({ driverId: "empty" })],
      rounds: [round({ roundId: "r1", driverId: "busy", stops: [{ key: "shop-1", outstanding: true }] })],
    });
    expect(out.additions.get("r1")?.map((p) => p.packageId)).toEqual(["p1"]);
  });

  // ⚠ FR-017 — capacity is judged over the WHOLE round. Without the seed a van filled across six
  // passes passes the gate six times.
  it("counts what the round already weighs", () => {
    const out = plan({
      packages: [pkg({ packageId: "p2", shopId: "shop-2", weightGrams: 2000 })],
      rounds: [round({ roundId: "r1", driverId: "d1", weightGrams: 899_000, stops: [{ key: "shop-1", outstanding: true }] })],
    });
    expect(out.additions.size).toBe(0);
    expect(out.unassigned.map((p) => p.packageId)).toEqual(["p2"]);
    expect(out.exclusions.map((e) => e.reason)).toContain("over_capacity");
  });

  // 60 minutes to the deadline at 12 minutes a stop is five stops. The round already has five.
  it("counts the stops the round already has", () => {
    const five = ["a", "b", "c", "d", "e"].map((key) => ({ key, outstanding: true }));
    const out = plan({
      packages: [pkg({ packageId: "p6", shopId: "shop-6" })],
      rounds: [round({ roundId: "r1", driverId: "d1", stops: five })],
    });
    expect(out.unassigned.map((p) => p.packageId)).toEqual(["p6"]);
    expect(out.exclusions.map((e) => e.reason)).toContain("cannot_meet_deadline");
  });

  it("uses the OLDEST planned round when a dispatcher's move left a driver with two", () => {
    const out = plan({
      packages: [pkg({ packageId: "p9", shopId: "shop-9" })],
      rounds: [round({ roundId: "older", driverId: "d1" }), round({ roundId: "newer", driverId: "d1" })],
    });
    expect([...out.additions.keys()]).toEqual(["older"]);
  });

  it("starts a new round for a driver whose only round for the run is under way", () => {
    const out = plan({
      packages: [pkg({ packageId: "p2", shopId: "shop-2" })],
      rounds: [round({ roundId: "r1", driverId: "d1", status: "in_progress", stops: [{ key: "shop-1", outstanding: true }] })],
    });
    expect(out.additions.size).toBe(0);
    expect(out.assignments.get("d1")?.map((p) => p.packageId)).toEqual(["p2"]);
  });

  it("only records reasons for packages nobody took", () => {
    // The round visiting shop-1 is full; a second driver takes the package instead.
    const out = plan({
      packages: [pkg({ packageId: "p1", weightGrams: 5000 })],
      candidates: [driver({ driverId: "d1" }), driver({ driverId: "d2" })],
      rounds: [round({ roundId: "r1", driverId: "d1", weightGrams: 899_000, stops: [{ key: "shop-1", outstanding: true }] })],
    });
    expect(out.assignments.get("d2")?.map((p) => p.packageId)).toEqual(["p1"]);
    expect(out.exclusions).toEqual([]);
  });
});

describe("planWave — work that cannot be started yet (072, FR-005)", () => {
  // A run five hours off that opens 45 minutes before it.
  const far = new Date(NOW.getTime() + 5 * 3600_000);
  const opensAt = new Date(far.getTime() - 45 * 60_000);
  const shops = (n: number) =>
    Array.from({ length: n }, (_, i) => pkg({ packageId: `p${i}`, shopId: `shop-${i}` }));

  // ⚠ Without `opensAt`, five hours of planning lead looks like five hours of working time: 25 stops.
  it("allows no more stops than fit between OPENING and the deadline", () => {
    const out = plan({ packages: shops(5), deadlineAt: far, opensAt });
    expect(out.assignments.get("d1")).toHaveLength(3); // 45 min ÷ 12 min
    expect(out.unassigned).toHaveLength(2);
    expect(out.exclusions.every((e) => e.reason === "cannot_meet_deadline")).toBe(true);
  });

  it("refuses a driver whose shift ends before the round opens", () => {
    const leavesFirst = driver({ driverId: "d1", expectedEndAt: new Date(opensAt.getTime() - 60_000).toISOString() });
    const out = plan({ packages: shops(1), candidates: [leavesFirst], deadlineAt: far, opensAt });
    expect(out.unassigned).toHaveLength(1);
    expect(out.exclusions.map((e) => e.reason)).toEqual(["cannot_meet_deadline"]);
  });

  it("carries the delivery window through to the plan", () => {
    const windowStartAt = new Date(far.getTime() - 2 * 3600_000);
    expect(plan({ deadlineAt: far, opensAt, windowStartAt }).windowStartAt).toEqual(windowStartAt);
    expect(plan().windowStartAt).toBeNull();
  });
});

describe("planWave — determinism (FR-014, SC-007)", () => {
  it("produces the same plan for the same inputs, whatever order the candidates arrive in", () => {
    const packages = [pkg({ packageId: "p1" }), pkg({ packageId: "p2", shopId: "shop-2" })];
    const a = planWave({
      kind: "collection", packages, plannedFor: NOW, deadlineAt: DEADLINE, now: NOW,
      perStopAllowanceMin: 12,
      candidates: [driver({ driverId: "zoe" }), driver({ driverId: "amy" })],
    });
    const b = planWave({
      kind: "collection", packages, plannedFor: NOW, deadlineAt: DEADLINE, now: NOW,
      perStopAllowanceMin: 12,
      candidates: [driver({ driverId: "amy" }), driver({ driverId: "zoe" })],
    });
    expect([...a.assignments.keys()].sort()).toEqual([...b.assignments.keys()].sort());
    expect(a.assignments.get("amy")?.map((p) => p.packageId)).toEqual(b.assignments.get("amy")?.map((p) => p.packageId));
  });
});
