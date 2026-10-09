import { describe, expect, it } from "vitest";

import { melbourneDate, lastOrderCutoff } from "./schedule";
import { at, wallClock } from "./test-clock";

describe("lastOrderCutoff", () => {
  it("one run: a single daily cutoff, inclusive at the boundary", () => {
    const runs = [{ hour: 14, minute: 0 }]; // 2pm
    const buffer = 120; // → cutoff 12:00

    const cutoff = lastOrderCutoff(at(11, 30), runs, buffer);
    expect(cutoff).not.toBeNull();
    expect(wallClock(cutoff!)).toMatchObject({ hour: 12, minute: 0 });

    expect(lastOrderCutoff(at(12, 0), runs, buffer)).not.toBeNull(); // exactly on it: still offered
    expect(lastOrderCutoff(at(12, 30), runs, buffer)).toBeNull();
  });

  it("several runs extend availability through the day", () => {
    const runs = [{ hour: 11, minute: 0 }, { hour: 17, minute: 0 }];
    const buffer = 60; // cutoffs 10:00 and 16:00

    const cutoff = lastOrderCutoff(at(12, 0), runs, buffer);
    expect(wallClock(cutoff!).hour).toBe(16); // the latest makeable run
    expect(lastOrderCutoff(at(16, 30), runs, buffer)).toBeNull();
  });

  it("no runs → same-day is never offered", () => {
    expect(lastOrderCutoff(at(9, 0), [], 60)).toBeNull();
  });

  it("is judged in Melbourne, not UTC", () => {
    // 03:00 UTC is 13:00 AEST — before the 14:00 Melbourne run.
    const utc = new Date(Date.UTC(2026, 7, 24, 3, 0));
    expect(lastOrderCutoff(utc, [{ hour: 14, minute: 0 }], 0)).not.toBeNull();
  });
});

describe("melbourneDate", () => {
  it("23:30 UTC on the 23rd is already the 24th in Melbourne", () => {
    expect(melbourneDate(new Date(Date.UTC(2026, 7, 23, 23, 30)))).toBe("2026-08-24");
  });
});
