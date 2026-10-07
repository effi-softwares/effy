import { describe, expect, it } from "vitest";

import { nextRunInstant, type CollectionRun } from "./collection-deadline";

// The live dev schedule: five runs a day.
const RUNS: CollectionRun[] = [
  { hour: 12, minute: 0 },
  { hour: 14, minute: 0 },
  { hour: 16, minute: 0 },
  { hour: 21, minute: 0 },
  { hour: 23, minute: 0 },
];

/** An instant expressed in Melbourne winter wall-clock (AEST +10), for readability. */
function melb(iso: string): Date {
  return new Date(`${iso}+10:00`);
}

function melbStamp(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(at)
    .replace(", ", " ");
}

describe("nextRunInstant — which run a package made ready now belongs to (072)", () => {
  it("is the day's first run when nothing has run yet", () => {
    expect(melbStamp(nextRunInstant(RUNS, melb("2026-09-22T01:35:00"))!)).toBe("2026-09-22 12:00");
  });

  it("is the NEXT run between two runs — however far away it is", () => {
    // 16:05: the 16:00 run has gone; the next is 21:00, nearly five hours off. Until 072 nothing
    // would have been planned for it before 20:15.
    expect(melbStamp(nextRunInstant(RUNS, melb("2026-09-22T16:05:00"))!)).toBe("2026-09-22 21:00");
  });

  it("is TOMORROW's first run after the day's last", () => {
    expect(melbStamp(nextRunInstant(RUNS, melb("2026-09-22T23:30:00"))!)).toBe("2026-09-23 12:00");
  });

  // ⚠ Strictly after: nothing assigned AT the run time can be collected by that run.
  it("does not return a run whose time is exactly now", () => {
    expect(melbStamp(nextRunInstant(RUNS, melb("2026-09-22T14:00:00"))!)).toBe("2026-09-22 16:00");
  });

  it("still targets a run one minute away — the deadline gate, not this, decides it cannot be met", () => {
    expect(melbStamp(nextRunInstant(RUNS, melb("2026-09-22T13:59:00"))!)).toBe("2026-09-22 14:00");
  });

  it("is null when no run is configured — a platform with no runs has no rounds", () => {
    expect(nextRunInstant([], melb("2026-09-22T01:35:00"))).toBeNull();
  });

  it("ignores the order the runs are given in", () => {
    const shuffled = [RUNS[3]!, RUNS[0]!, RUNS[4]!, RUNS[2]!, RUNS[1]!];
    expect(melbStamp(nextRunInstant(shuffled, melb("2026-09-22T12:30:00"))!)).toBe("2026-09-22 14:00");
  });

  describe("daylight saving", () => {
    // DST ends Sunday 2026-04-05 at 03:00 AEDT → 02:00 AEST. A 14:00 run that day is 04:00Z.
    it("is right on the day the clocks go back", () => {
      const morning = new Date("2026-04-04T20:00:00Z"); // 07:00 AEDT … still before the change settles
      expect(nextRunInstant([{ hour: 14, minute: 0 }], morning)!.toISOString()).toBe("2026-04-05T04:00:00.000Z");
    });

    // DST starts Sunday 2026-10-04 at 02:00 AEST → 03:00 AEDT. A 14:00 run that day is 03:00Z.
    it("is right on the day the clocks go forward", () => {
      const morning = new Date("2026-10-03T22:00:00Z"); // 08:00 AEST… which is 09:00 AEDT that day
      expect(nextRunInstant([{ hour: 14, minute: 0 }], morning)!.toISOString()).toBe("2026-10-04T03:00:00.000Z");
    });

    it("crosses the change into tomorrow correctly", () => {
      // Saturday 2026-10-03 23:30 AEST; tomorrow's 12:00 is AEDT (+11) → 01:00Z.
      const lateSaturday = new Date("2026-10-03T13:30:00Z");
      expect(nextRunInstant([{ hour: 12, minute: 0 }], lateSaturday)!.toISOString()).toBe("2026-10-04T01:00:00.000Z");
    });
  });
});
