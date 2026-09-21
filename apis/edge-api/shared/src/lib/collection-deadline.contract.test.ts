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

describe("collectionDeadline — cross-language contract", () => {
  it.each(FIXTURES)("$name", ({ onDate, runHour, runMinute, bufferMin, expect: want }) => {
    const got = collectionDeadline({ hour: runHour, minute: runMinute }, bufferMin, new Date(onDate));
    expect(got.toISOString()).toBe(want);
  });

  it("covers both DST transitions — a fixture set without them proves nothing", () => {
    expect(FIXTURES.some((f) => f.name.includes("AMBIGUOUS"))).toBe(true);
    expect(FIXTURES.some((f) => f.name.includes("NON-EXISTENT"))).toBe(true);
  });
});

describe("wavePlanningTime and runsDueForPlanning", () => {
  const run = { hour: 14, minute: 0 };

  it("plans the lead time ahead of the deadline", () => {
    const onDate = new Date("2026-07-15T00:00:00Z");
    const deadline = collectionDeadline(run, 60, onDate);
    const planAt = wavePlanningTime(run, 60, 45, onDate);
    expect(deadline.getTime() - planAt.getTime()).toBe(45 * 60_000);
  });

  // ⚠ The scheduled tick is not the wave. The schedule decides when work is created.
  it("is not due before its planning moment", () => {
    const tooEarly = new Date("2026-07-15T01:00:00Z"); // 11:00 Melbourne; plan at 12:15
    expect(runsDueForPlanning([run], 60, 45, tooEarly)).toEqual([]);
  });

  it("is due once the planning moment has arrived", () => {
    const due = new Date("2026-07-15T02:20:00Z"); // 12:20 Melbourne
    expect(runsDueForPlanning([run], 60, 45, due)).toEqual([run]);
  });

  it("stops being due once the deadline itself has passed", () => {
    const tooLate = new Date("2026-07-15T03:30:00Z"); // 13:30 Melbourne, deadline was 13:00
    expect(runsDueForPlanning([run], 60, 45, tooLate)).toEqual([]);
  });

  it("selects only the runs that are due, from several", () => {
    const runs = [
      { hour: 10, minute: 0 },
      { hour: 14, minute: 0 },
      { hour: 18, minute: 0 },
    ];
    const at = new Date("2026-07-15T02:20:00Z"); // 12:20 Melbourne
    expect(runsDueForPlanning(runs, 60, 45, at)).toEqual([{ hour: 14, minute: 0 }]);
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
