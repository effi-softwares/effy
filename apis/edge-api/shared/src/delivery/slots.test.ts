import { describe, expect, it } from "vitest";

import { judgeSlot, openSlots, type Slot, type SlotVerdict } from "./slots";
import type { CollectionRun } from "./sameday";
import { at, melbourne, wallClock } from "./test-clock";

const c = (hour: number, minute: number) => ({ hour, minute });
const evening: Slot = { id: "evening", start: c(17, 0), end: c(19, 0), cutoff: c(15, 0), capacity: 2 };
const oneRun: CollectionRun[] = [{ hour: 14, minute: 0 }];
const run = (hour: number, minute: number): CollectionRun[] => [{ hour, minute }];

describe("judgeSlot", () => {
  const cases: Array<[string, Date, number, CollectionRun[], number, number, SlotVerdict]> = [
    ["open well before everything", at(10, 0), 0, oneRun, 60, 60, "open"],
    ["open with one place left", at(10, 0), 1, oneRun, 60, 60, "open"],
    ["full at capacity", at(10, 0), 2, oneRun, 60, 60, "full"],
    ["full above capacity (a late payer was honoured)", at(10, 0), 3, oneRun, 60, 60, "full"],
    ["open exactly at the last order time for the run", at(13, 0), 0, oneRun, 60, 60, "open"],
    ["uncollectable once the only run cannot be made", at(13, 1), 0, oneRun, 60, 60, "uncollectable"],
    ["past the slot's own cutoff", at(15, 1), 0, run(16, 30), 0, 0, "cutoff"],
    ["open exactly at the slot's cutoff", at(15, 0), 0, run(16, 30), 0, 0, "open"],
    ["past cutoff wins over full", at(15, 1), 2, run(16, 30), 0, 0, "cutoff"],
    ["uncollectable when the run reaches the hub after the slot starts", at(10, 0), 0, run(16, 30), 60, 60, "uncollectable"],
    ["collectable when the run lands exactly at the slot's start", at(10, 0), 0, run(16, 0), 60, 60, "open"],
    ["uncollectable with no runs configured", at(10, 0), 0, [], 60, 60, "uncollectable"],
    ["a later run that still serves the slot keeps it open", at(13, 30), 0, [{ hour: 14, minute: 0 }, { hour: 15, minute: 30 }], 60, 60, "open"],
  ];

  it.each(cases)("%s", (_name, now, booked, runs, buffer, turnaround, want) => {
    expect(judgeSlot(now, evening, booked, runs, buffer, turnaround).verdict).toBe(want);
  });

  it("reports the window as instants and the EFFECTIVE cutoff", () => {
    const j = judgeSlot(at(10, 0), evening, 0, oneRun, 60, 60);
    if (j.verdict !== "open") throw new Error(`verdict ${j.verdict}`);
    expect(j.slot.date).toBe("2026-08-24");
    expect(j.slot.start.getTime()).toBe(at(17, 0).getTime());
    expect(j.slot.end.getTime()).toBe(at(19, 0).getTime());
    // The run's last order time (13:00) comes before the slot's own 15:00.
    expect(j.slot.cutoff.getTime()).toBe(at(13, 0).getTime());

    const own = judgeSlot(at(10, 0), evening, 0, run(16, 0), 0, 60);
    if (own.verdict !== "open") throw new Error(`verdict ${own.verdict}`);
    expect(own.slot.cutoff.getTime()).toBe(at(15, 0).getTime());
  });

  it.each([
    ["the day daylight saving starts", 2026, 10, 4, 11 * 60],
    ["the day daylight saving ends", 2027, 4, 4, 10 * 60],
  ])("%s: the window keeps its wall-clock hours and its length", (_name, y, m, d, wantOffset) => {
    const now = melbourne(y, m, d, 10);
    const j = judgeSlot(now, evening, 0, oneRun, 60, 60);
    if (j.verdict !== "open") throw new Error(`verdict ${j.verdict}`);
    expect(wallClock(j.slot.start).hour).toBe(17);
    expect(wallClock(j.slot.end).hour).toBe(19);
    expect(j.slot.end.getTime() - j.slot.start.getTime()).toBe(2 * 3600_000);
    expect(wallClock(j.slot.start).offsetMinutes).toBe(wantOffset);
    expect(j.slot.date).toBe(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  });

  it("is judged on the Melbourne day, not the UTC one", () => {
    const j = judgeSlot(new Date(Date.UTC(2026, 7, 23, 23, 30)), evening, 0, oneRun, 60, 60);
    expect(j.verdict).toBe("open");
    if (j.verdict === "open") expect(j.slot.date).toBe("2026-08-24");
  });
});

describe("openSlots", () => {
  it("returns only open slots, earliest first", () => {
    const late: Slot = { id: "late", start: c(19, 0), end: c(21, 0), cutoff: c(17, 0), capacity: 5 };
    const full: Slot = { id: "full", start: c(18, 0), end: c(20, 0), cutoff: c(16, 0), capacity: 1 };
    const got = openSlots(at(10, 0), [late, full, evening], new Map([["full", 1]]), oneRun, 60, 60);
    expect(got.map((s) => s.id)).toEqual(["evening", "late"]);
  });
});
