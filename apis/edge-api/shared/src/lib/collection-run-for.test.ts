import { describe, expect, it } from "vitest";

import { collectionRunFor, type CollectionRun } from "./collection-deadline";

/** 082 P1 — which collection run a parcel sold a window travels on. */
const RUNS: CollectionRun[] = [{ hour: 9, minute: 0 }, { hour: 14, minute: 0 }, { hour: 18, minute: 0 }];
const TURNAROUND = 60;
/** Melbourne wall-clock in October–March (AEDT, +11). */
const aedt = (iso: string) => new Date(`${iso}+11:00`);
const stamp = (d: Date | null) =>
  d === null
    ? null
    : new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
        .format(d).replace(", ", " ");

describe("collectionRunFor (082 P1)", () => {
  it("the LATEST run that reaches the hub in time for the window, on the window's day", () => {
    // 4 pm window, 60 min at the hub: the 2 pm run makes it, the 6 pm does not.
    expect(stamp(collectionRunFor(aedt("2026-10-15T16:00:00"), RUNS, TURNAROUND))).toBe("2026-10-15 14:00");
    // 3 pm exactly: 2 pm + 60 min = 3 pm, which is in time.
    expect(stamp(collectionRunFor(aedt("2026-10-15T15:00:00"), RUNS, TURNAROUND))).toBe("2026-10-15 14:00");
    // 2:59 pm: only the 9 am run makes it.
    expect(stamp(collectionRunFor(aedt("2026-10-15T14:59:00"), RUNS, TURNAROUND))).toBe("2026-10-15 09:00");
  });

  it("a window before its own day's first workable run is collected on the previous day's LAST run", () => {
    expect(stamp(collectionRunFor(aedt("2026-10-15T08:00:00"), RUNS, TURNAROUND))).toBe("2026-10-14 18:00");
  });

  it("skips a non-delivery weekday and a non-delivery date on the way back", () => {
    // Monday 19 Oct 2026, 8 am window; Sunday (7) has no deliveries → Saturday's last run.
    expect(stamp(collectionRunFor(aedt("2026-10-19T08:00:00"), RUNS, TURNAROUND, { noWeekdays: [7] }))).toBe("2026-10-17 18:00");
    // …and Saturday is a closed date too → Friday's.
    expect(stamp(collectionRunFor(aedt("2026-10-19T08:00:00"), RUNS, TURNAROUND, { noWeekdays: [7], noDates: new Set(["2026-10-17"]) }))).toBe("2026-10-16 18:00");
  });

  it("⚠ the window's own day is used even when the calendar now says no deliveries: it was sold", () => {
    expect(stamp(collectionRunFor(aedt("2026-10-18T16:00:00"), RUNS, TURNAROUND, { noWeekdays: [7] }))).toBe("2026-10-18 14:00");
  });

  it("is right across the days the clocks change", () => {
    // Clocks go forward 4 Oct 2026 (02:00 → 03:00): a Sunday 8 am window (AEDT) ← Saturday's 6 pm (AEST).
    expect(stamp(collectionRunFor(new Date("2026-10-04T08:00:00+11:00"), RUNS, TURNAROUND))).toBe("2026-10-03 18:00");
    // Clocks go back 4 Apr 2027 (03:00 → 02:00): a Sunday 4 pm window (AEST) ← that day's 2 pm run.
    expect(stamp(collectionRunFor(new Date("2027-04-04T16:00:00+10:00"), RUNS, TURNAROUND))).toBe("2027-04-04 14:00");
    expect(stamp(collectionRunFor(new Date("2027-04-04T08:00:00+10:00"), RUNS, TURNAROUND))).toBe("2027-04-03 18:00");
  });

  it("no runs, or none within reach: null — the caller falls back to the next run", () => {
    expect(collectionRunFor(aedt("2026-10-15T16:00:00"), [], TURNAROUND)).toBeNull();
    expect(collectionRunFor(aedt("2026-10-15T08:00:00"), RUNS, TURNAROUND, { noWeekdays: [1, 2, 3, 4, 5, 6, 7] })).toBeNull();
  });
});
