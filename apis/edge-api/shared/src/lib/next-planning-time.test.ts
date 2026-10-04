import { describe, expect, it } from "vitest";

import { nextPlanningTime, runsDueForPlanning, type CollectionRun } from "./collection-deadline";

// The live dev schedule that exposed the silence: five runs and a 45-minute planning lead, which
// leaves five 45-minute windows in a 24-hour day, each ending AT its run time (corrected 2026-09-30 —
// the prep buffer no longer shifts the window; it belongs to checkout).
const RUNS: CollectionRun[] = [
  { hour: 12, minute: 0 },
  { hour: 14, minute: 0 },
  { hour: 16, minute: 0 },
  { hour: 21, minute: 0 },
  { hour: 23, minute: 0 },
];
const LEAD = 45;

/** An instant expressed in Melbourne wall-clock, for readability. */
function melb(iso: string): Date {
  return new Date(`${iso}+10:00`);
}

function melbHHMM(at: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
}

describe("nextPlanningTime — the answer to 'then when?'", () => {
  it("names the first window of the day when nothing is due overnight", () => {
    const now = melb("2026-09-22T01:35:00");
    expect(runsDueForPlanning(RUNS, LEAD, now)).toHaveLength(0);

    // run 12:00 − 45 lead = 11:15.
    expect(melbHHMM(nextPlanningTime(RUNS, LEAD, now)!)).toBe("11:15");
  });

  it("names the NEXT window when one has already passed", () => {
    const now = melb("2026-09-22T12:30:00"); // 11:15–12:00 window closed
    expect(melbHHMM(nextPlanningTime(RUNS, LEAD, now)!)).toBe("13:15");
  });

  it("rolls over to tomorrow after the last window of the day", () => {
    const now = melb("2026-09-22T23:30:00"); // every window today is behind us
    const next = nextPlanningTime(RUNS, LEAD, now)!;
    expect(melbHHMM(next)).toBe("11:15");
    expect(next.getTime()).toBeGreaterThan(now.getTime());
  });

  it("returns the current instant's own window when one is open", () => {
    const now = melb("2026-09-22T11:20:00"); // inside 11:15–12:00
    expect(runsDueForPlanning(RUNS, LEAD, now)).toHaveLength(1);
    // Already due, so the next PLANNING time is the following window, never one in the past.
    expect(nextPlanningTime(RUNS, LEAD, now)!.getTime()).toBeGreaterThanOrEqual(now.getTime());
  });

  it("is null when no run is configured, rather than inventing one", () => {
    expect(nextPlanningTime([], LEAD, melb("2026-09-22T01:35:00"))).toBeNull();
  });
});
