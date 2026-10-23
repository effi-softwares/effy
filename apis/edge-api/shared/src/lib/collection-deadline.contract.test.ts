import { describe, expect, it } from "vitest";

import { collectionDeadline, endOfLocalDay } from "./collection-deadline";

/**
 * DST fixtures for resolving a Melbourne run time to an instant (checkout's cutoff and the planner's
 * deadline both use it). Melbourne 2026: DST ends Sun 5 April (02:30 happens twice) and starts
 * Sun 4 October (02:30 never happens).
 */

// Fixtures: do not "tidy" an expected instant.
const FIXTURES: ReadonlyArray<{
  name: string;
  onDate: string;
  runHour: number;
  runMinute: number;
  bufferMin: number;
  expect: string;
}> = [
  {
    name: "summer, AEDT +11",
    onDate: "2026-01-15T00:00:00Z",
    runHour: 14,
    runMinute: 0,
    bufferMin: 60,
    expect: "2026-01-15T02:00:00.000Z",
  },
  {
    name: "winter, AEST +10",
    onDate: "2026-07-15T00:00:00Z",
    runHour: 14,
    runMinute: 0,
    bufferMin: 60,
    expect: "2026-07-15T03:00:00.000Z",
  },
  {
    name: "the day DST ENDS, run after the transition",
    onDate: "2026-04-05T00:00:00Z",
    runHour: 14,
    runMinute: 0,
    bufferMin: 60,
    expect: "2026-04-05T03:00:00.000Z",
  },
  {
    name: "the day DST STARTS, run after the transition",
    onDate: "2026-10-04T00:00:00Z",
    runHour: 14,
    runMinute: 0,
    bufferMin: 60,
    expect: "2026-10-04T02:00:00.000Z",
  },
  {
    // 02:30 occurs twice: the earlier instant wins (a deadline may be strict, never loose).
    name: "AMBIGUOUS local time — 02:30 on the day DST ends",
    onDate: "2026-04-05T00:00:00Z",
    runHour: 2,
    runMinute: 30,
    bufferMin: 0,
    expect: "2026-04-04T15:30:00.000Z",
  },
  {
    // 02:30 never happens: the instant just before the gap wins.
    name: "NON-EXISTENT local time — 02:30 on the day DST starts",
    onDate: "2026-10-04T00:00:00Z",
    runHour: 2,
    runMinute: 30,
    bufferMin: 0,
    expect: "2026-10-03T15:30:00.000Z",
  },
  {
    name: "zero buffer is the run time itself",
    onDate: "2026-06-01T00:00:00Z",
    runHour: 9,
    runMinute: 15,
    bufferMin: 0,
    expect: "2026-05-31T23:15:00.000Z",
  },
  {
    name: "a buffer that crosses back over local midnight",
    onDate: "2026-06-01T00:00:00Z",
    runHour: 0,
    runMinute: 30,
    bufferMin: 60,
    expect: "2026-05-31T13:30:00.000Z",
  },
];

/**
 * checkout's cutoff == the planner's collection deadline − the prep buffer: a shop always gets the
 * configured buffer between ordering closing and the driver arriving.
 */
describe("checkout cutoff == collection deadline − prep buffer", () => {
  it.each(FIXTURES)("$name", ({ onDate, runHour, runMinute, bufferMin, expect: want }) => {
    const deadline = collectionDeadline({ hour: runHour, minute: runMinute }, new Date(onDate));
    const cutoff = new Date(deadline.getTime() - bufferMin * 60_000);
    expect(cutoff.toISOString()).toBe(want);
  });

  it("covers both DST transitions — a fixture set without them proves nothing", () => {
    expect(FIXTURES.some((f) => f.name.includes("AMBIGUOUS"))).toBe(true);
    expect(FIXTURES.some((f) => f.name.includes("NON-EXISTENT"))).toBe(true);
  });
});

describe("the collection deadline", () => {
  // Winter (AEST +10): a 14:00 Melbourne run is 04:00Z.
  const run = { hour: 14, minute: 0 };
  const onDate = new Date("2026-07-15T00:00:00Z");

  /** The driver collects at the run time, not before it. */
  it("IS the run time", () => {
    expect(collectionDeadline(run, onDate).toISOString()).toBe("2026-07-15T04:00:00.000Z");
  });

  // Which run a package belongs to is `nextRunInstant`; when its round opens is `public.round_opens_at`.
});

describe("endOfLocalDay — DST-safe, because the first draft of it was not", () => {
  it("is 23:59:59 local in summer (AEDT +11)", () => {
    expect(endOfLocalDay(new Date("2026-01-15T05:00:00Z")).toISOString()).toBe("2026-01-15T12:59:59.000Z");
  });

  // A hardcoded −11h offset would fail this row.
  it("is 23:59:59 local in winter (AEST +10) — an hour different, and the hardcoded version was wrong here", () => {
    expect(endOfLocalDay(new Date("2026-07-15T05:00:00Z")).toISOString()).toBe("2026-07-15T13:59:59.000Z");
  });

  // The day begins at +11 and ends at +10, so its last instant is an hour later in UTC than in summer.
  it("is correct on the day DST ends, which is 25 hours long", () => {
    expect(endOfLocalDay(new Date("2026-04-05T05:00:00Z")).toISOString()).toBe("2026-04-05T13:59:59.000Z");
  });

  it("is correct on the day DST starts, which is 23 hours long", () => {
    expect(endOfLocalDay(new Date("2026-10-04T05:00:00Z")).toISOString()).toBe("2026-10-04T12:59:59.000Z");
  });
});
