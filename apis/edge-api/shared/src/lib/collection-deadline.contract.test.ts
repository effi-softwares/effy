import { describe, expect, it } from "vitest";

import { melbourneDate, sameDayCutoff } from "../delivery/sameday";
import { collectionDeadline, endOfLocalDay, runsDueForPlanning, wavePlanningTime } from "./collection-deadline";

/**
 * ⚠ THE DST FIXTURES. Two rules read one clock — when same-day ordering closes (checkout) and when
 * collection must be finished (the wave planner) — and both resolve a Melbourne wall-clock run time
 * to an instant through `collection-deadline.ts`.
 *
 * Until 070 the checkout half was written in a second language on a second backend, and this file
 * was one side of a hand-duplicated fixture set that kept the two honest. There is one
 * implementation now, so the fixtures pin IT — and, below, the real checkout function is called
 * and held to them, rather than a formula restated in the test.
 *
 * ⚠ THE DST ROWS ARE THE POINT. 058 found two real calendar bugs that only DST tests caught,
 * including one that silently skipped an entire trading hour. Melbourne 2026: DST ENDS Sun 5 April
 * (03:00 → 02:00, so 02:30 happens twice) and STARTS Sun 4 October (02:00 → 03:00, so 02:30 never
 * happens).
 */

// ─── FIXTURES — unchanged since 063; do not "tidy" an expected instant ────────────────────────────
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
    // ⚠ 02:30 occurs TWICE. The earlier instant wins — a deadline may be strict, never loose.
    name: "AMBIGUOUS local time — 02:30 on the day DST ends",
    onDate: "2026-04-05T00:00:00Z",
    runHour: 2,
    runMinute: 30,
    bufferMin: 0,
    expect: "2026-04-04T15:30:00.000Z",
  },
  {
    // ⚠ 02:30 NEVER HAPPENS. The instant just before the gap wins, by the same rule.
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
// ─── END FIXTURES ─────────────────────────────────────────────────────────────────────────────────

/**
 * ⚠ WHAT THIS PINS, AND WHAT IT ONCE WRONGLY PINNED. Before 2026-09-30 it asserted that collection
 * must finish at the very instant same-day ordering closes. That WAS the bug: it left a shop zero
 * time to pick and let a shopper buy "same-day" for a package that could only be collected
 * tomorrow. A test that pins a defect turns it into something a later reader is told not to touch.
 *
 * The relationship the two rules are supposed to have:
 *
 *     checkout's cutoff  ==  the planner's collection deadline  −  the prep buffer
 *
 * i.e. a shop always gets exactly the configured buffer between ordering closing and the driver
 * arriving.
 */
describe("checkout cutoff == collection deadline − prep buffer", () => {
  it.each(FIXTURES)("$name", ({ onDate, runHour, runMinute, bufferMin, expect: want }) => {
    const deadline = collectionDeadline({ hour: runHour, minute: runMinute }, new Date(onDate));
    const cutoff = new Date(deadline.getTime() - bufferMin * 60_000);
    expect(cutoff.toISOString()).toBe(want);
  });

  /**
   * ⚠ THE REAL CHECKOUT FUNCTION, not the formula above. Asked a moment before the expected
   * cutoff it must answer exactly that instant; asked a moment after, that run is gone.
   */
  it.each(FIXTURES)("checkout's own sameDayCutoff agrees: $name", ({ runHour, runMinute, bufferMin, expect: want }) => {
    const run = [{ hour: runHour, minute: runMinute }];
    const at = new Date(want).getTime();
    // ⚠ A buffer longer than the time since midnight puts the cutoff on the PREVIOUS local day. Such
    // a run can never be ordered for on its own day, and checkout says so by offering nothing —
    // it does not reach back and sell tomorrow's run as "same-day".
    if (melbourneDate(new Date(at)) !== melbourneDate(new Date(at + bufferMin * 60_000))) {
      expect(sameDayCutoff(new Date(at - 1000), run, bufferMin)).toBeNull();
      expect(sameDayCutoff(new Date(at + bufferMin * 60_000 - 1000), run, bufferMin)).toBeNull();
      return;
    }
    expect(sameDayCutoff(new Date(at - 1000), run, bufferMin)?.toISOString()).toBe(want);
    expect(sameDayCutoff(new Date(at), run, bufferMin)?.toISOString()).toBe(want); // the cutoff instant itself is still in time
    const after = sameDayCutoff(new Date(at + 1000), run, bufferMin);
    // Either nothing can be made today, or the answer is a LATER day's cutoff — never this one.
    if (after) expect(after.getTime()).toBeGreaterThan(at);
  });

  it("covers both DST transitions — a fixture set without them proves nothing", () => {
    expect(FIXTURES.some((f) => f.name.includes("AMBIGUOUS"))).toBe(true);
    expect(FIXTURES.some((f) => f.name.includes("NON-EXISTENT"))).toBe(true);
  });
});

describe("wavePlanningTime and runsDueForPlanning", () => {
  // Winter (AEST +10): a 14:00 Melbourne run is 04:00Z.
  const run = { hour: 14, minute: 0 };
  const onDate = new Date("2026-07-15T00:00:00Z");

  /** ⚠ THE CORRECTION ITSELF: the driver collects at the run time, not before it. */
  it("the collection deadline IS the run time", () => {
    expect(collectionDeadline(run, onDate).toISOString()).toBe("2026-07-15T04:00:00.000Z");
  });

  it("plans the lead time ahead of the run", () => {
    const planAt = wavePlanningTime(run, 45, onDate);
    expect(collectionDeadline(run, onDate).getTime() - planAt.getTime()).toBe(45 * 60_000);
  });

  /**
   * ⚠ THE INVARIANT THE BUG VIOLATED. With the live settings (120-minute buffer, 45-minute lead),
   * same-day ordering for the 14:00 run closes at 12:00 and planning starts at 13:15 — so a shop gets
   * 75 minutes to pick before the first pass. Under the old rule ordering closed AT the deadline and
   * the shop got nothing.
   */
  it("gives the shop time to pick between ordering closing and planning starting", () => {
    const buffer = 120;
    const lead = 45;
    const orderingCloses = collectionDeadline(run, onDate).getTime() - buffer * 60_000;
    const planningStarts = wavePlanningTime(run, lead, onDate).getTime();
    expect(planningStarts - orderingCloses).toBe((buffer - lead) * 60_000);
    expect(planningStarts).toBeGreaterThan(orderingCloses);
  });

  // ⚠ The scheduled tick is not the wave. The schedule decides when work is created.
  it("is not due before its planning moment", () => {
    const tooEarly = new Date("2026-07-15T01:00:00Z"); // 11:00 Melbourne; plan at 13:15
    expect(runsDueForPlanning([run], 45, tooEarly)).toEqual([]);
  });

  /**
   * ⚠ The old rule would have said NOT due here — 12:30 was already past its deadline of 12:00
   * (run − 60). Same-day ordering has closed at this point, and that is exactly when the shop should be
   * picking, with collection still to come.
   */
  it("is not yet due just after same-day ordering closes — the shop is picking", () => {
    const shopPicking = new Date("2026-07-15T02:30:00Z"); // 12:30 Melbourne
    expect(runsDueForPlanning([run], 45, shopPicking)).toEqual([]);
  });

  it("is due once the planning moment has arrived", () => {
    const due = new Date("2026-07-15T03:20:00Z"); // 13:20 Melbourne
    expect(runsDueForPlanning([run], 45, due)).toEqual([run]);
  });

  it("is still due right up to the run time", () => {
    const lastMinute = new Date("2026-07-15T03:59:00Z"); // 13:59 Melbourne
    expect(runsDueForPlanning([run], 45, lastMinute)).toEqual([run]);
  });

  it("stops being due once the run time has passed", () => {
    const tooLate = new Date("2026-07-15T04:30:00Z"); // 14:30 Melbourne
    expect(runsDueForPlanning([run], 45, tooLate)).toEqual([]);
  });

  it("selects only the runs that are due, from several", () => {
    const runs = [
      { hour: 10, minute: 0 },
      { hour: 14, minute: 0 },
      { hour: 18, minute: 0 },
    ];
    const at = new Date("2026-07-15T03:20:00Z"); // 13:20 Melbourne
    expect(runsDueForPlanning(runs, 45, at)).toEqual([{ hour: 14, minute: 0 }]);
  });
});

describe("endOfLocalDay — DST-safe, because the first draft of it was not", () => {
  it("is 23:59:59 local in summer (AEDT +11)", () => {
    expect(endOfLocalDay(new Date("2026-01-15T05:00:00Z")).toISOString()).toBe("2026-01-15T12:59:59.000Z");
  });

  // ⚠ The planner's first draft hardcoded a −11h offset. This row is the one that caught it.
  it("is 23:59:59 local in winter (AEST +10) — an hour different, and the hardcoded version was wrong here", () => {
    expect(endOfLocalDay(new Date("2026-07-15T05:00:00Z")).toISOString()).toBe("2026-07-15T13:59:59.000Z");
  });

  // ⚠ The day BEGINS at +11 and ENDS at +10, so the last instant is an hour "later" in UTC than the
  // summer case. My first expectation here said 12:59:59 — the test caught my arithmetic, not the
  // code's, which is what a fixture covering a transition is for.
  it("is correct on the day DST ends, which is 25 hours long", () => {
    expect(endOfLocalDay(new Date("2026-04-05T05:00:00Z")).toISOString()).toBe("2026-04-05T13:59:59.000Z");
  });

  it("is correct on the day DST starts, which is 23 hours long", () => {
    expect(endOfLocalDay(new Date("2026-10-04T05:00:00Z")).toISOString()).toBe("2026-10-04T12:59:59.000Z");
  });
});
