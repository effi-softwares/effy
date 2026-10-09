import { describe, expect, it } from "vitest";

import type { CollectionRun } from "./schedule";
import { judgeWindow, type Slot } from "./slots";
import { melbourne, wallClock } from "./test-clock";
import { effyDays, openWindows, windowsUnavailable } from "./windows";

const c = (hour: number, minute = 0) => ({ hour, minute });
// Three daily windows: late morning (cutoff 09:00), afternoon (14:00), evening (17:00).
const morning: Slot = { id: "morning", start: c(10), end: c(12), cutoff: c(9), capacity: null };
const afternoon: Slot = { id: "afternoon", start: c(16), end: c(18), cutoff: c(14), capacity: null };
const evening: Slot = { id: "evening", start: c(18), end: c(20), cutoff: c(17), capacity: 2 };
const slots = [morning, afternoon, evening];
// Runs at 08:00, 13:00 and 16:30; shops need 30 minutes' notice; the hub needs 60 to turn goods round.
const runs: CollectionRun[] = [c(8), c(13), c(16, 30)];
const BUFFER = 30;
const TURNAROUND = 60;

// Tuesday 6 October 2026.
const tue = (hour: number, minute = 0) => melbourne(2026, 10, 6, hour, minute);
const ids = (now: Date, lookahead = 3, noWeekdays: number[] = [], noDates: string[] = [], load = new Map<string, Map<string, number>>()) =>
  openWindows(now, effyDays(now, lookahead, noWeekdays, new Set(noDates)), slots, load, runs, BUFFER, TURNAROUND)
    .map((d) => [d.date, d.windows.map((w) => w.id), d.closedReason] as const);

describe("effyDays", () => {
  it("is today and the next three days", () => {
    expect(effyDays(tue(10), 3).map((d) => d.date)).toEqual(["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]);
    expect(effyDays(tue(10), 3)[0]).toEqual({ date: "2026-10-06", isToday: true, nonDelivery: false });
  });

  it("P3 — skips a non-delivery weekday and date, and neither counts toward the three", () => {
    // Friday 9 October; no Sundays; Monday 12 October is a public holiday.
    const days = effyDays(melbourne(2026, 10, 9, 10), 3, [7], new Set(["2026-10-12"]));
    expect(days.map((d) => d.date)).toEqual(["2026-10-09", "2026-10-10", "2026-10-13", "2026-10-14"]);
  });

  it("P3 — keeps today when Effy does not deliver today, flagged, and still offers three later days", () => {
    const days = effyDays(tue(10), 3, [2]);
    expect(days[0]).toEqual({ date: "2026-10-06", isToday: true, nonDelivery: true });
    expect(days.slice(1).map((d) => d.date)).toEqual(["2026-10-07", "2026-10-08", "2026-10-09"]);
  });

  it.each([[1, 2], [14, 15]])("look-ahead %i gives %i days", (lookahead, total) => {
    expect(effyDays(tue(10), lookahead)).toHaveLength(total);
  });

  it("P5 — one minute either side of midnight is two different todays", () => {
    expect(effyDays(melbourne(2026, 10, 6, 23, 59), 3)[0]!.date).toBe("2026-10-06");
    expect(effyDays(melbourne(2026, 10, 7, 0, 0), 3)[0]!.date).toBe("2026-10-07");
  });

  it.each([
    ["clocks go forward on 4 October 2026", melbourne(2026, 10, 3, 23, 30), ["2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06"]],
    ["clocks go back on 4 April 2027", melbourne(2027, 4, 3, 23, 30), ["2027-04-03", "2027-04-04", "2027-04-05", "2027-04-06"]],
    ["just after the clocks went back", melbourne(2027, 4, 4, 0, 30), ["2027-04-04", "2027-04-05", "2027-04-06", "2027-04-07"]],
  ])("P5 — no day repeats or goes missing when %s", (_name, now, want) => {
    expect(effyDays(now, 3).map((d) => d.date)).toEqual(want);
  });
});

describe("openWindows", () => {
  it("P1 — at 10:00 today lacks the window whose cutoff has passed; every later day has all three", () => {
    expect(ids(tue(10))).toEqual([
      ["2026-10-06", ["afternoon", "evening"], null],
      ["2026-10-07", ["morning", "afternoon", "evening"], null],
      ["2026-10-08", ["morning", "afternoon", "evening"], null],
      ["2026-10-09", ["morning", "afternoon", "evening"], null],
    ]);
  });

  it("P1 — the cutoff alone closes a window today that a run could still serve, and not tomorrow", () => {
    // Starts 15:00, so the 13:00 run serves it; only its 09:00 cutoff stands in the way at 10:00.
    const early: Slot = { id: "early", start: c(15), end: c(17), cutoff: c(9), capacity: null };
    expect(judgeWindow(tue(10), "2026-10-06", early, 0, runs, BUFFER, TURNAROUND).verdict).toBe("cutoff");
    expect(judgeWindow(tue(9), "2026-10-06", early, 0, runs, BUFFER, TURNAROUND).verdict).toBe("open");
    expect(judgeWindow(tue(10), "2026-10-07", early, 0, runs, BUFFER, TURNAROUND).verdict).toBe("open");
  });

  it("P2 — after the last cutoff today is closed and the later days are untouched", () => {
    const out = ids(tue(17, 1));
    expect(out[0]).toEqual(["2026-10-06", [], "closed"]);
    expect(out.slice(1).every(([, w]) => w.length === 3)).toBe(true);
  });

  it("P3 — a day Effy does not deliver says so and offers nothing", () => {
    expect(ids(tue(10), 3, [2])[0]).toEqual(["2026-10-06", [], "not_delivery_day"]);
  });

  it("P4 — a window nobody can collect for is gone TODAY and there tomorrow", () => {
    // The evening window starts at 18:00, so the last run that serves it is 16:30, ordered by 16:00.
    // At 16:01 its own cutoff (17:00) has not passed, but nothing can be collected for it today.
    expect(judgeWindow(tue(16, 1), "2026-10-06", evening, 0, runs, BUFFER, TURNAROUND).verdict).toBe("uncollectable");
    expect(judgeWindow(tue(16, 1), "2026-10-07", evening, 0, runs, BUFFER, TURNAROUND).verdict).toBe("open");
    // …and with no runs configured at all a later day is still open: collection is judged today only.
    expect(judgeWindow(tue(10), "2026-10-07", evening, 0, [], BUFFER, TURNAROUND).verdict).toBe("open");
    expect(judgeWindow(tue(10), "2026-10-06", evening, 0, [], BUFFER, TURNAROUND).verdict).toBe("uncollectable");
  });

  it("today's effective cutoff is the last collection; a later day's is the window's own", () => {
    const today = judgeWindow(tue(10), "2026-10-06", evening, 0, runs, BUFFER, TURNAROUND);
    const later = judgeWindow(tue(10), "2026-10-08", evening, 0, runs, BUFFER, TURNAROUND);
    if (today.verdict !== "open" || later.verdict !== "open") throw new Error("expected both open");
    expect(wallClock(today.slot.cutoff)).toMatchObject({ hour: 16, minute: 0 });
    expect(wallClock(later.slot.cutoff)).toMatchObject({ hour: 17, minute: 0 });
    expect(later.slot.date).toBe("2026-10-08");
  });

  it("a full window on one day says nothing about another", () => {
    const load = new Map([["2026-10-08", new Map([["evening", 2]])]]);
    const out = ids(tue(10), 3, [], [], load);
    expect(out[2]).toEqual(["2026-10-08", ["morning", "afternoon"], null]);
    expect(out[3]).toEqual(["2026-10-09", ["morning", "afternoon", "evening"], null]);
  });

  it("a day whose only open window is full is 'full', not 'closed'", () => {
    const only = [evening];
    const load = new Map([["2026-10-07", new Map([["evening", 5]])]]);
    const days = openWindows(tue(10), effyDays(tue(10), 1), only, load, runs, BUFFER, TURNAROUND);
    expect(days[1]).toMatchObject({ windows: [], closedReason: "full" });
    expect(windowsUnavailable(days, only)).toBeNull(); // today's is still open
  });

  it("a window with no limit never fills", () => {
    expect(judgeWindow(tue(8), "2026-10-07", morning, 10_000, runs, BUFFER, TURNAROUND).verdict).toBe("open");
  });

  it("a window on a day that has gone is past its cutoff", () => {
    expect(judgeWindow(tue(10), "2026-10-05", evening, 0, runs, BUFFER, TURNAROUND).verdict).toBe("cutoff");
  });

  it("P5 — a window keeps its wall-clock times on the days the clocks change", () => {
    for (const [now, date] of [[melbourne(2026, 10, 3, 12), "2026-10-04"], [melbourne(2027, 4, 3, 12), "2027-04-04"]] as const) {
      const j = judgeWindow(now, date, morning, 0, runs, BUFFER, TURNAROUND);
      if (j.verdict !== "open") throw new Error("expected open");
      expect(wallClock(j.slot.start)).toMatchObject({ hour: 10, minute: 0 });
      expect(wallClock(j.slot.end)).toMatchObject({ hour: 12, minute: 0 });
      expect(j.slot.end.getTime() - j.slot.start.getTime()).toBe(2 * 3600_000);
    }
  });

  it("P5 — a window chosen as 'tomorrow' is judged by today's rules once midnight passes", () => {
    // 23:58 on Tuesday: Wednesday's morning window is a later day — open, whatever the runs.
    expect(judgeWindow(melbourne(2026, 10, 6, 23, 58), "2026-10-07", morning, 0, [], BUFFER, TURNAROUND).verdict).toBe("open");
    // 00:01 on Wednesday: the same window is TODAY's, and with no run it cannot be collected for.
    expect(judgeWindow(melbourne(2026, 10, 7, 0, 1), "2026-10-07", morning, 0, [], BUFFER, TURNAROUND).verdict).toBe("uncollectable");
  });
});

describe("windowsUnavailable", () => {
  it("none_defined when no window is switched on", () => {
    const days = openWindows(tue(10), effyDays(tue(10), 3), [], new Map(), runs, BUFFER, TURNAROUND);
    expect(windowsUnavailable(days, [])).toBe("none_defined");
    expect(days.every((d) => d.closedReason === "closed")).toBe(true);
  });

  it("no_windows when every day is closed or taken", () => {
    const only = [evening];
    const full = new Map(["2026-10-07", "2026-10-08", "2026-10-09"].map((d) => [d, new Map([["evening", 2]])]));
    const days = openWindows(tue(17, 1), effyDays(tue(17, 1), 3), only, full, runs, BUFFER, TURNAROUND);
    expect(windowsUnavailable(days, only)).toBe("no_windows");
  });
});
