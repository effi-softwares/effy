import { describe, expect, it } from "vitest";

import { planWave, type AssignInput } from "./assign";
import type { PlannablePackage, PlannerCandidate } from "./types";

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
    openStops: new Map(),
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

describe("planWave — a package that becomes ready mid-round (FR-004a)", () => {
  const openStop = new Map([
    ["shop-1", { stopId: "stop-1", driverId: "d1", deadlineAt: DEADLINE, locked: false }],
  ]);

  it("joins the round when that shop's stop is still outstanding", () => {
    const out = plan({ openStops: openStop });
    expect(out.lateJoins.get("stop-1")?.map((p) => p.packageId)).toEqual(["p1"]);
    expect(out.assignments.size).toBe(0);
  });

  it("does NOT join a round a dispatcher has locked", () => {
    const locked = new Map([
      ["shop-1", { stopId: "stop-1", driverId: "d1", deadlineAt: DEADLINE, locked: true }],
    ]);
    const out = plan({ openStops: locked });
    expect(out.lateJoins.size).toBe(0);
    expect(out.assignments.has("d1")).toBe(true);
  });

  // ⚠ FR-004c — the fix for one problem must not create another.
  it("refuses the late join when it would breach capacity, and records why", () => {
    const out = plan({
      packages: [pkg({ packageId: "heavy", weightGrams: 900_001 })],
      openStops: openStop,
    });
    expect(out.lateJoins.size).toBe(0);
    expect(out.exclusions.some((e) => e.reason === "over_capacity")).toBe(true);
  });

  it("waits for the next wave when that shop's stop is already done", () => {
    const out = plan({ openStops: new Map() });
    expect(out.lateJoins.size).toBe(0);
    expect(out.assignments.has("d1")).toBe(true);
  });
});

describe("planWave — determinism (FR-014, SC-007)", () => {
  it("produces the same plan for the same inputs, whatever order the candidates arrive in", () => {
    const packages = [pkg({ packageId: "p1" }), pkg({ packageId: "p2", shopId: "shop-2" })];
    const a = planWave({
      kind: "collection", packages, plannedFor: NOW, deadlineAt: DEADLINE, now: NOW,
      perStopAllowanceMin: 12, openStops: new Map(),
      candidates: [driver({ driverId: "zoe" }), driver({ driverId: "amy" })],
    });
    const b = planWave({
      kind: "collection", packages, plannedFor: NOW, deadlineAt: DEADLINE, now: NOW,
      perStopAllowanceMin: 12, openStops: new Map(),
      candidates: [driver({ driverId: "amy" }), driver({ driverId: "zoe" })],
    });
    expect([...a.assignments.keys()].sort()).toEqual([...b.assignments.keys()].sort());
    expect(a.assignments.get("amy")?.map((p) => p.packageId)).toEqual(b.assignments.get("amy")?.map((p) => p.packageId));
  });
});
