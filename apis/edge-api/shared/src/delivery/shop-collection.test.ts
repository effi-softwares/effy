import { describe, expect, it } from "vitest";

import { instantAtLocalTime } from "../lib/collection-deadline";

import { runForPackage, type CollectionSchedule, type PackageRunFacts } from "./shop-collection";

const at = (h: number, m = 0, day = 27) => instantAtLocalTime(2026, 10, day, h, m);
const schedule: CollectionSchedule = {
  runs: [{ hour: 9, minute: 0 }, { hour: 12, minute: 30 }, { hour: 16, minute: 0 }],
  hubTurnaroundMin: 60,
  calendar: {},
};
const pkg = (over: Partial<PackageRunFacts> = {}): PackageRunFacts => ({ deliveredBy: "effy", windowStart: null, assignedRunAt: null, ...over });

describe("the run expected to collect a shop's package (099 — the planner's rule)", () => {
  it("is the next run for a package with no window, and for a courier parcel via the hub", () => {
    expect(runForPackage(pkg(), schedule, at(10))).toEqual(at(12, 30));
    expect(runForPackage(pkg({ deliveredBy: "courier", windowStart: at(18) }), schedule, at(10))).toEqual(at(12, 30));
  });

  it("waits for the latest run that still makes a later window", () => {
    expect(runForPackage(pkg({ windowStart: at(15, 0, 28) }), schedule, at(10))).toEqual(at(12, 30, 28));
  });

  it("puts a package whose due run has passed on the next run", () => {
    expect(runForPackage(pkg({ windowStart: at(11) }), schedule, at(10))).toEqual(at(12, 30));
  });

  it("follows the round a package is already assigned to", () => {
    expect(runForPackage(pkg({ assignedRunAt: at(16) }), schedule, at(10))).toEqual(at(16));
  });

  it("has no run when no runs are set up", () => {
    expect(runForPackage(pkg(), { ...schedule, runs: [] }, at(10))).toBeNull();
  });
});
