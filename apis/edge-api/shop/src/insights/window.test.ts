import { describe, expect, it } from "vitest";

import { addLocalDays, bucketsFor, isoWeek, offsetMinutes, planFor, startOfLocalDay, startOfLocalWeek, windowLabel } from "./window";

/** The calendar arithmetic, against real zone rules via `Intl`: every bug here produces a plausible number. */

const MELBOURNE = "Australia/Melbourne";
const ADELAIDE = "Australia/Adelaide";

describe("zone offsets", () => {
  it("tracks daylight saving rather than assuming one offset per zone", () => {
    // Melbourne is +11 in January and +10 in July.
    expect(offsetMinutes(new Date("2026-01-15T00:00:00Z"), MELBOURNE)).toBe(11 * 60);
    expect(offsetMinutes(new Date("2026-07-15T00:00:00Z"), MELBOURNE)).toBe(10 * 60);
  });

  it("handles half-hour zones", () => {
    expect(offsetMinutes(new Date("2026-07-15T00:00:00Z"), ADELAIDE)).toBe(9 * 60 + 30);
  });
});

describe("local day boundaries", () => {
  it("starts 'today' at the shop's midnight, not the server's", () => {
    // 2026-09-14T04:00Z is 14:00 Monday Melbourne; the day began at 14:00Z on the 13th.
    const start = startOfLocalDay(new Date("2026-09-14T04:00:00Z"), MELBOURNE);
    expect(start.toISOString()).toBe("2026-09-13T14:00:00.000Z");
  });

  it("starts a half-hour zone's day on the half hour", () => {
    const start = startOfLocalDay(new Date("2026-07-15T04:00:00Z"), ADELAIDE);
    expect(start.toISOString()).toBe("2026-07-14T14:30:00.000Z");
  });

  it("⚠ adds days by the CALENDAR, so a 23-hour day still moves exactly one day", () => {
    // 2026-10-04 is 23 hours long in Melbourne; adding 86,400,000 ms would shift every later bucket.
    const springForward = startOfLocalDay(new Date("2026-10-04T06:00:00Z"), MELBOURNE);
    const next = addLocalDays(springForward, MELBOURNE, 1);
    expect((next.getTime() - springForward.getTime()) / 3_600_000).toBe(23);

    // And the fall-back day is 25.
    const fallBack = startOfLocalDay(new Date("2026-04-05T06:00:00Z"), MELBOURNE);
    expect((addLocalDays(fallBack, MELBOURNE, 1).getTime() - fallBack.getTime()) / 3_600_000).toBe(25);
  });
});

describe("weeks", () => {
  it("starts on Monday", () => {
    // 2026-09-14 is a Monday; its week starts that morning.
    const start = startOfLocalWeek(new Date("2026-09-16T04:00:00Z"), MELBOURNE); // a Wednesday
    expect(startOfLocalDay(new Date("2026-09-14T04:00:00Z"), MELBOURNE).toISOString()).toBe(
      start.toISOString(),
    );
  });

  it("numbers weeks the ISO way", () => {
    expect(isoWeek(new Date("2026-01-01T12:00:00Z"), "UTC")).toBe(1);
    expect(isoWeek(new Date("2026-09-14T12:00:00Z"), "UTC")).toBe(38);
  });
});

describe("range plans", () => {
  const now = new Date("2026-09-14T04:00:00Z"); // Monday 14:00 in Melbourne

  it("compares today with the SAME WEEKDAY last week, up to the same time of day", () => {
    const plan = planFor("today", now, MELBOURNE);
    expect(plan.basis).toBe("same_weekday_last_week");
    expect(plan.window.from.toISOString()).toBe("2026-09-13T14:00:00.000Z"); // local midnight
    expect(plan.window.to).toEqual(now);

    // The comparison is truncated to the same time of day.
    const windowMs = plan.window.to.getTime() - plan.window.from.getTime();
    const comparisonMs = plan.comparison.to.getTime() - plan.comparison.from.getTime();
    expect(comparisonMs).toBe(windowMs);
    expect(plan.comparison.from.toISOString()).toBe("2026-09-06T14:00:00.000Z");
  });

  it("covers seven whole local days for 7d, against the seven before them", () => {
    const plan = planFor("7d", now, MELBOURNE);
    expect(plan.basis).toBe("previous_7_days");
    expect(plan.grain).toBe("day");
    expect(plan.window.from.toISOString()).toBe("2026-09-07T14:00:00.000Z");
    expect(plan.comparison.from.toISOString()).toBe("2026-08-31T14:00:00.000Z");
    expect(plan.comparison.to.toISOString()).toBe(plan.window.from.toISOString());
  });

  it("buckets 30 days by week", () => {
    const plan = planFor("30d", now, MELBOURNE);
    expect(plan.grain).toBe("week");
    expect(plan.basis).toBe("previous_30_days");
  });
});

describe("⚠ buckets across daylight saving", () => {
  it("gives a 25-hour day 25 hourly buckets, with 02 appearing twice", () => {
    // 2026-04-05: clocks go back at 03:00 AEDT → 02:00 AEST.
    const endOfThatDay = new Date("2026-04-05T13:59:00Z"); // 23:59 local
    const plan = planFor("today", endOfThatDay, MELBOURNE);
    const buckets = bucketsFor(plan, MELBOURNE);

    expect(buckets).toHaveLength(25);
    expect(buckets.filter((b) => b.label === "02")).toHaveLength(2);
    // Two distinct instants sharing a label.
    const [first, second] = buckets.filter((b) => b.label === "02");
    expect(first!.start.toISOString()).not.toBe(second!.start.toISOString());
  });

  it("gives a 23-hour day 23 hourly buckets, with no 03", () => {
    // 2026-10-04: 02:00 AEST jumps to 03:00 AEDT, so the local 02:00 hour never happens.
    const endOfThatDay = new Date("2026-10-04T12:59:00Z"); // 23:59 local
    const plan = planFor("today", endOfThatDay, MELBOURNE);
    const buckets = bucketsFor(plan, MELBOURNE);

    expect(buckets).toHaveLength(23);
    expect(buckets.filter((b) => b.label === "02")).toHaveLength(0);
  });

  it("marks the final bucket partial while the hour is still running", () => {
    const plan = planFor("today", new Date("2026-09-14T04:30:00Z"), MELBOURNE);
    const buckets = bucketsFor(plan, MELBOURNE);
    expect(buckets.at(-1)!.partial).toBe(true);
  });
});

describe("window labels", () => {
  it("names one day for today and a range otherwise", () => {
    const now = new Date("2026-09-14T04:00:00Z");
    expect(windowLabel(planFor("today", now, MELBOURNE), MELBOURNE)).toBe("14 September");
    expect(windowLabel(planFor("7d", now, MELBOURNE), MELBOURNE)).toBe("8 September – 14 September");
  });
});
