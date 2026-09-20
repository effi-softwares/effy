import { describe, expect, it } from "vitest";

import type { DriverBlockedReason } from "@effy/shared-types";

import { BLOCKED_LABEL, formatTime } from "./model";

/**
 * ⚠ NP12 — THE GUARD THAT STOPS A BLOCKED DRIVER RENDERING AS "NOT BLOCKED".
 *
 * `BLOCKED_LABEL` is read as `d.blockedReasons.map((r) => BLOCKED_LABEL[r]).join(" · ")`. A key that
 * is missing at runtime yields `undefined`, and a joined `undefined` renders as an empty string — so
 * a driver who CANNOT WORK appears with no reason beside them, which reads as "this driver is fine".
 *
 * The `Record<DriverBlockedReason, string>` type already catches a widening at compile time, and 061
 * confirmed that by widening the enum and watching tsc name both missing keys. This test exists for
 * the case the type does NOT catch: somebody loosening it to `Record<string, string>` or `Partial<>`
 * during a refactor, which compiles perfectly and fails silently on screen.
 *
 * 053, 056 and 057 each shipped a defect through an enum widening. This is the cheap way to not be
 * the fourth.
 */
describe("BLOCKED_LABEL — every blocking reason has words a person can act on", () => {
  const ALL_REASONS: DriverBlockedReason[] = [
    "no_zone",
    "suspended",
    "offboarded",
    "licence_expired",
    "no_vehicle",
    "vehicle_non_compliant",
  ];

  it("⚠ has a label for EVERY DriverBlockedReason, with no silent gap", () => {
    for (const reason of ALL_REASONS) {
      const label = BLOCKED_LABEL[reason];
      expect(label, `no label for blocked reason "${reason}"`).toBeTruthy();
      expect(label.length, `label for "${reason}" is too short to be actionable`).toBeGreaterThan(5);
    }
  });

  it("⚠ carries no MORE keys than the union, so a removed reason cannot linger as dead copy", () => {
    expect(Object.keys(BLOCKED_LABEL).sort()).toEqual([...ALL_REASONS].sort());
  });

  it("names the remedy's subject — the vehicle reason must not read as the driver's fault", () => {
    // A driver holding a van with lapsed rego is faultless. The words must send an operator to the
    // vehicle, not to the person.
    expect(BLOCKED_LABEL.vehicle_non_compliant.toLowerCase()).toContain("vehicle");
    expect(BLOCKED_LABEL.no_vehicle.toLowerCase()).toContain("vehicle");
  });
});

describe("formatTime — the operator's own clock", () => {
  it("renders in Melbourne time, not UTC", () => {
    // 2026-09-20T08:30:00Z is 6:30 pm in Melbourne (AEST, +10).
    expect(formatTime("2026-09-20T08:30:00.000Z")).toMatch(/6:30/);
  });

  it("degrades to an em dash rather than throwing on a bad value", () => {
    expect(formatTime("not-a-time")).toBe("—");
  });
});
