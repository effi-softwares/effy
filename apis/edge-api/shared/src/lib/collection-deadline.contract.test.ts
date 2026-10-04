import { describe, expect, it } from "vitest";

import { collectionDeadline, endOfLocalDay, runsDueForPlanning, wavePlanningTime } from "./collection-deadline";

/**
 * ⚠⚠ THE CROSS-LANGUAGE CONTRACT. This file and
 * `apis/core-api/internal/platform/delivery/deadline_contract_test.go` consume BYTE-IDENTICAL
 * fixtures, duplicated by hand.
 *
 * It is the entire justification for `collection-deadline.ts` existing at all. The rule is written
 * twice — once in Go for checkout, once in TypeScript for the planner — because the runtimes cannot
 * share code (research R2). 054 spent a whole slice deleting a rule written in 14 places; this one is
 * written in two ON PURPOSE, and is only defensible while these fixtures agree.
 *
 * ⚠ IF YOU WEAKEN THIS TEST, THE DUPLICATE IS NO LONGER JUSTIFIED. Delete one implementation instead.
 *
 * Precedent: 028 closed 027's biggest carry-forward exactly this way — a Go test and a Kotlin test
 * sharing one hand-duplicated JSON literal, proven by breaking it two ways.
 *
 * ⚠ THE DST ROWS ARE THE POINT. 058 found two real calendar bugs that only DST tests caught,
 * including one that silently skipped an entire trading hour. Melbourne 2026: DST ENDS Sun 5 April
 * (03:00 → 02:00, so 02:30 happens twice) and STARTS Sun 4 October (02:00 → 03:00, so 02:30 never
 * happens).
 */

// ─── FIXTURES — keep byte-identical with the Go side ──────────────────────────────────────────────
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
 * ⚠⚠ WHAT THIS CONTRACT PINS CHANGED ON 2026-09-30, AND THE FIXTURES DID NOT.
 *
 * It used to assert `collectionDeadline(run, buffer) == SameDayCutoff(run, buffer)` — that collection
 * must finish at the very instant same-day ordering closes. That WAS the bug: it left a shop zero time
 * to pick, made the configured run time meaningless, and let a shopper buy "same-day" for a package that
 * could only be collected tomorrow. A contract test that pins a defect is worse than none, because it
 * turns the defect into something a later reader is told not to touch.
 *
 * It now pins the relationship the two halves are supposed to have:
 *
 *     Go's checkout cutoff  ==  the planner's collection deadline  −  the prep buffer
 *
 * i.e. a shop always gets exactly the configured buffer between ordering closing and the driver
 * arriving. The fixtures are byte-identical to the Go side and unchanged, so the DST-sensitive part —
 * resolving a Melbourne wall-clock run time to an instant — is still proven identical in both runtimes.
 */
describe("checkout cutoff == collection deadline − prep buffer — cross-language contract", () => {
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
