import { describe, expect, it } from "vitest";

import { nextCourierPickup } from "./courier-pickup";
import { melbourne, wallClock } from "./test-clock";

/** 080 P1 — when a courier parcel is due out. Days are Melbourne days; the cutoff is the service's. */
describe("nextCourierPickup", () => {
  const weekdays = [1, 2, 3, 4, 5]; // Mon–Fri
  const cutoff = { hour: 14, minute: 0 };
  const iso = (d: Date) => `${d.toISOString()}`;

  it("today, before the cutoff: today's cutoff", () => {
    // Fri 9 Oct 2026, 10:00
    expect(iso(nextCourierPickup(melbourne(2026, 10, 9, 10), weekdays, cutoff))).toBe(iso(melbourne(2026, 10, 9, 14)));
  });

  it("at the cutoff exactly: still today's", () => {
    expect(iso(nextCourierPickup(melbourne(2026, 10, 9, 14), weekdays, cutoff))).toBe(iso(melbourne(2026, 10, 9, 14)));
  });

  it("after the cutoff on a Friday: Monday's", () => {
    expect(iso(nextCourierPickup(melbourne(2026, 10, 9, 15), weekdays, cutoff))).toBe(iso(melbourne(2026, 10, 12, 14)));
  });

  it("on a non-pickup day: the next pickup day", () => {
    // Sat 10 Oct
    expect(iso(nextCourierPickup(melbourne(2026, 10, 10, 9), weekdays, cutoff))).toBe(iso(melbourne(2026, 10, 12, 14)));
  });

  it("a once-a-week service, from the day after it: a week later", () => {
    // Sundays only; from Mon 12 Oct → Sun 18 Oct
    expect(iso(nextCourierPickup(melbourne(2026, 10, 12, 9), [7], cutoff))).toBe(iso(melbourne(2026, 10, 18, 14)));
    // From Sunday after its cutoff → the next Sunday
    expect(iso(nextCourierPickup(melbourne(2026, 10, 18, 15), [7], cutoff))).toBe(iso(melbourne(2026, 10, 25, 14)));
  });

  it("across the day the clocks go forward (Sun 4 Oct 2026) and back (Sun 4 Apr 2027): the cutoff keeps its wall-clock time", () => {
    const fwd = nextCourierPickup(melbourne(2026, 10, 3, 15), [7, 1], cutoff);
    expect(iso(fwd)).toBe(iso(melbourne(2026, 10, 4, 14)));
    expect(wallClock(fwd)).toMatchObject({ hour: 14, minute: 0 });
    const back = nextCourierPickup(melbourne(2027, 4, 3, 15), [7], cutoff);
    expect(iso(back)).toBe(iso(melbourne(2027, 4, 4, 14)));
    expect(wallClock(back)).toMatchObject({ hour: 14, minute: 0 });
  });

  it("refuses a service with no pickup day", () => {
    expect(() => nextCourierPickup(melbourne(2026, 10, 9, 10), [], cutoff)).toThrow();
  });
});
