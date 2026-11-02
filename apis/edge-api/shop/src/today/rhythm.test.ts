import { describe, expect, it } from "vitest";

import { buildAhead } from "./service";
import { usualHours } from "./rhythm";

const week = [
  { hour: 8, orders: 1 },
  { hour: 10, orders: 4 },
  { hour: 12, orders: 9 },
  { hour: 17, orders: 3 },
];

describe("a usual time is said only with enough behind it", () => {
  it("names when orders start and the busiest hour", () => {
    expect(usualHours(week, 4)).toEqual({ startHour: 10, busiestHour: 12 });
  });

  it("says nothing from one day, however busy", () => {
    expect(usualHours(week, 1)).toEqual({});
  });

  it("says nothing from a handful of orders", () => {
    expect(usualHours([{ hour: 9, orders: 3 }, { hour: 11, orders: 4 }], 4)).toEqual({});
  });

  it("does not say the start and the peak twice when they are the same hour", () => {
    expect(usualHours([{ hour: 11, orders: 12 }], 3)).toEqual({ busiestHour: 11 });
  });
});

describe("the day ahead", () => {
  const now = new Date("2026-09-14T00:30:00Z"); // 10:30 am in Melbourne
  const at = (hours: number) => new Date(now.getTime() + hours * 3_600_000);

  it("merges runs and usual hours, soonest first, and drops what has passed", () => {
    const ahead = buildAhead([{ runAt: at(2.5), orders: 2 }], { hours: week, days: 4 }, now);
    expect(ahead.map((a) => a.kind)).toEqual(["busiest", "run"]);
    expect(ahead[1]).toMatchObject({ orders: 2 });
  });

  it("stops at the limit", () => {
    const runs = [1, 2, 3, 4, 5, 6, 7].map((h) => ({ runAt: at(h), orders: 0 }));
    expect(buildAhead(runs, { hours: [], days: 0 }, now)).toHaveLength(5);
  });

  it("is empty at the end of the day", () => {
    expect(buildAhead([], { hours: week, days: 4 }, at(13))).toEqual([]);
  });
});
