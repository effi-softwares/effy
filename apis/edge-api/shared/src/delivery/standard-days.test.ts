import { describe, expect, it } from "vitest";

import type { CollectionRun } from "./sameday";
import { availableDays } from "./standard-days";
import { at, melbourne } from "./test-clock";

const run2pm: CollectionRun[] = [{ hour: 14, minute: 0 }]; // with a 60-minute buffer: makeable until 13:00
const days = (
  now: Date, runs: CollectionRun[], lead: number, lookahead: number, weekdays: number[] = [], dates: string[] = [],
) => availableDays(now, runs, 60, lead, lookahead, weekdays, new Set(dates));

describe("availableDays", () => {
  it("before the last run: collected today and delivered after the lead time", () => {
    expect(days(at(10, 0), run2pm, 1, 3)).toEqual(["2026-08-25", "2026-08-26", "2026-08-27"]);
  });
  it("after the last run: collected tomorrow", () => {
    expect(days(at(13, 1), run2pm, 1, 3)).toEqual(["2026-08-26", "2026-08-27", "2026-08-28"]);
  });
  it("no collection runs configured: treated as collected tomorrow", () => {
    expect(days(at(10, 0), [], 1, 2)).toEqual(["2026-08-26", "2026-08-27"]);
  });
  it("lead time zero: the hub day itself is deliverable", () => {
    expect(days(at(10, 0), run2pm, 0, 2)).toEqual(["2026-08-24", "2026-08-25"]);
  });
  it("lead time two", () => {
    expect(days(at(10, 0), run2pm, 2, 2)).toEqual(["2026-08-26", "2026-08-27"]);
  });
  it("an excluded weekday is skipped and does not count toward the look-ahead", () => {
    expect(days(at(10, 0), run2pm, 1, 7, [7])).toEqual([
      "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28", "2026-08-29", "2026-08-31", "2026-09-01",
    ]);
  });
  it("an excluded date is skipped and does not count", () => {
    expect(days(at(10, 0), run2pm, 1, 3, [], ["2026-08-26"])).toEqual(["2026-08-25", "2026-08-27", "2026-08-28"]);
  });
  it("a blocked earliest day moves the list forward", () => {
    expect(days(at(10, 0), run2pm, 1, 2, [2])).toEqual(["2026-08-26", "2026-08-27"]); // Tuesday blocked
  });
  it("a whole blocked week still yields days after it", () => {
    const week = ["2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31"];
    expect(days(at(10, 0), run2pm, 1, 2, [], week)).toEqual(["2026-09-01", "2026-09-02"]);
  });

  it("crosses the year boundary", () => {
    expect(days(melbourne(2026, 12, 30, 10), [{ hour: 14, minute: 0 }], 1, 3)).toEqual([
      "2026-12-31", "2027-01-01", "2027-01-02",
    ]);
  });

  it.each([
    ["across the start of daylight saving (4 Oct 2026)", melbourne(2026, 10, 2, 10), ["2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06"]],
    ["across the end of daylight saving (4 Apr 2027)", melbourne(2027, 4, 2, 10), ["2027-04-03", "2027-04-04", "2027-04-05", "2027-04-06"]],
  ])("%s: no day repeated or skipped", (_name, now, want) => {
    expect(days(now, [{ hour: 14, minute: 0 }], 1, 4)).toEqual(want);
  });

  it("uses the Melbourne day", () => {
    // 22:00 UTC on the 23rd is 08:00 on the 24th in Melbourne.
    expect(days(new Date(Date.UTC(2026, 7, 23, 22, 0)), [{ hour: 14, minute: 0 }], 1, 1)).toEqual(["2026-08-25"]);
  });

  it("never offers more than the look-ahead", () => {
    expect(days(at(10, 0), [], 1, 30)).toHaveLength(30);
  });
});
