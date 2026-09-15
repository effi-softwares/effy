import { describe, expect, it } from "vitest";

import {
  addLocalDays,
  bucketsFor,
  isoWeek,
  localHourStart,
  offsetMinutes,
  planFor,
  startOfLocalDay,
  startOfLocalWeek,
  windowLabel,
} from "./window";

/**
 * The calendar arithmetic (058, US3).
 *
 * ⚠ THIS IS THE HEAVIEST PURE-TEST SURFACE IN THE SLICE, on purpose. Every bug available here
 * produces a number that looks entirely plausible: a day that starts at the wrong hour, a week that
 * begins on Sunday, an hour that vanishes in October, a shop in Adelaide whose hours are all thirty
 * minutes out. None of them throws, none of them fails a typecheck, and the only way to catch them
 * is to assert against real zone rules — which `Intl` has, so no container is needed.
 */

const MELBOURNE = "Australia/Melbourne";
const ADELAIDE = "Australia/Adelaide"; // UTC+9:30 / +10:30 — the half-hour zone that breaks assumptions

describe("zone offsets", () => {
  it("tracks daylight saving rather than assuming one offset per zone", () => {
    // Melbourne is +11 in January and +10 in July. A single constant is wrong for half of every year.
    expect(offsetMinutes(new Date("2026-01-15T00:00:00Z"), MELBOURNE)).toBe(11 * 60);
    expect(offsetMinutes(new Date("2026-07-15T00:00:00Z"), MELBOURNE)).toBe(10 * 60);
  });

  it("handles half-hour zones", () => {
    expect(offsetMinutes(new Date("2026-07-15T00:00:00Z"), ADELAIDE)).toBe(9 * 60 + 30);
  });
});

describe("local day boundaries", () => {
  it("starts 'today' at the shop's midnight, not the server's", () => {
    // 2026-09-14T04:00Z is 14:00 Monday in Melbourne; the day began at 00:00 local = 14:00Z on the 13th.
    const start = startOfLocalDay(new Date("2026-09-14T04:00:00Z"), MELBOURNE);
    expect(start.toISOString()).toBe("2026-09-13T14:00:00.000Z");
  });

  it("starts a half-hour zone's day on the half hour", () => {
    const start = startOfLocalDay(new Date("2026-07-15T04:00:00Z"), ADELAIDE);
    expect(start.toISOString()).toBe("2026-07-14T14:30:00.000Z");
  });

  it("⚠ adds days by the CALENDAR, so a 23-hour day still moves exactly one day", () => {
    // 2026-10-04 is the spring-forward day in Melbourne: THAT local day is 23 hours long, so the step
    // from its midnight to the next is 23 real hours. Adding 86,400,000 ms would land at 01:00 on the
    // 5th and quietly shift every bucket after it.
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

    // ⚠ The comparison is TRUNCATED: 14 hours of last Monday against 14 hours of this one. A morning
    // measured against a whole day would read as a collapse every morning.
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
    // Two DISTINCT instants sharing a label — the thing a 24-bucket implementation silently merges.
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

describe("bucket keys agree with the database's", () => {
  it("⚠ keeps the two 02:00 hours APART on the day daylight saving ends", () => {
    // Melbourne, 2026-04-05: 02:30 happens twice — once at +11 (15:30Z) and once at +10 (16:30Z).
    // Rebuilding the instant from the wall-clock fields cannot tell them apart and collapses both
    // into one bucket, which is what the first draft of this function did. The SQL side
    // (`triggers.container.test.ts`) asserts the same two instants stay distinct.
    const firstPass = localHourStart(new Date("2026-04-04T15:30:00Z"), MELBOURNE);
    const secondPass = localHourStart(new Date("2026-04-04T16:30:00Z"), MELBOURNE);

    expect(firstPass.toISOString()).toBe("2026-04-04T15:00:00.000Z");
    expect(secondPass.toISOString()).toBe("2026-04-04T16:00:00.000Z");
    expect(firstPass.toISOString()).not.toBe(secondPass.toISOString());
  });

  it("computes the same hour start the migration's shop_local_hour does", () => {
    // Mirrors `triggers.container.test.ts`, which asserts the SQL side of this same instant. If the
    // two ever disagree, the reader addresses buckets the writer never wrote — and every figure
    // reads as zero, with nothing failing.
    expect(localHourStart(new Date("2026-06-01T04:17:00Z"), ADELAIDE).toISOString()).toBe(
      "2026-06-01T03:30:00.000Z",
    );
  });
});

describe("window labels", () => {
  it("names one day for today and a range otherwise", () => {
    const now = new Date("2026-09-14T04:00:00Z");
    expect(windowLabel(planFor("today", now, MELBOURNE), MELBOURNE)).toBe("14 September");
    expect(windowLabel(planFor("7d", now, MELBOURNE), MELBOURNE)).toBe("8 September – 14 September");
  });
});
