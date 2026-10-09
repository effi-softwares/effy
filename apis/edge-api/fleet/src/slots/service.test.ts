import { describe, expect, it } from "vitest";

import { daysProblems } from "../deliverydays/service";
import { slotProblems } from "./service";

const OK = { startTime: "17:00", endTime: "19:00", cutoffTime: "15:00", capacity: 2 };
const fields = (v: Record<string, unknown>) => slotProblems({ ...OK, ...v }).map((e) => e.field);

/** FR-037 — each refusal names its field, so the console can put the message where the mistake is. */
describe("slotProblems", () => {
  it("accepts a well-formed slot, including a cutoff AT the start", () => {
    expect(slotProblems(OK)).toEqual([]);
    expect(fields({ cutoffTime: "17:00" })).toEqual([]);
  });

  it("refuses an end that is not after the start", () => {
    expect(fields({ endTime: "17:00" })).toEqual(["endTime"]);
    expect(fields({ endTime: "16:00" })).toEqual(["endTime"]);
  });

  it("refuses a cutoff after the start", () => {
    expect(fields({ cutoffTime: "17:01" })).toEqual(["cutoffTime"]);
  });

  it("refuses a capacity limit that is not a whole number of at least one", () => {
    for (const capacity of [0, -1, 1.5, "2", Number.NaN]) {
      expect(fields({ capacity }), String(capacity)).toEqual(["capacity"]);
    }
  });

  it("⚠ accepts a slot with NO capacity — no limit is the default", () => {
    expect(fields({ capacity: null })).toEqual([]);
    expect(fields({ capacity: undefined })).toEqual([]);
    expect(slotProblems({ startTime: "17:00", endTime: "19:00", cutoffTime: "15:00" })).toEqual([]);
  });

  it("refuses anything that is not a time of day, without also reporting an ordering problem", () => {
    for (const startTime of ["5pm", "24:00", "17:60", "1700", "", null, 17]) {
      expect(fields({ startTime }), String(startTime)).toEqual(["startTime"]);
    }
  });

  it("reports every problem at once", () => {
    expect(slotProblems({ startTime: "x", endTime: "y", cutoffTime: "z", capacity: 0 }).map((e) => e.field)).toEqual([
      "startTime", "endTime", "cutoffTime", "capacity",
    ]);
  });
});

describe("daysProblems", () => {
  const DAYS = { effyLookaheadDays: 3, noDeliveryWeekdays: [7], slotHoldMin: 10, hubTurnaroundMin: 60 };
  const f = (v: Record<string, unknown>) => daysProblems({ ...DAYS, ...v } as never).map((e) => e.field);

  it("accepts the defaults and the edges", () => {
    expect(daysProblems(DAYS)).toEqual([]);
    expect(f({ effyLookaheadDays: 1 })).toEqual([]);
    expect(f({ effyLookaheadDays: 14, hubTurnaroundMin: 0, noDeliveryWeekdays: [] })).toEqual([]);
  });

  it("⚠ refuses closing every day of the week — a served address must always be offered a day", () => {
    expect(f({ noDeliveryWeekdays: [1, 2, 3, 4, 5, 6, 7] })).toEqual(["noDeliveryWeekdays"]);
  });

  it("refuses weekdays out of range or repeated", () => {
    expect(f({ noDeliveryWeekdays: [0] })).toEqual(["noDeliveryWeekdays"]);
    expect(f({ noDeliveryWeekdays: [8] })).toEqual(["noDeliveryWeekdays"]);
    expect(f({ noDeliveryWeekdays: [1, 1] })).toEqual(["noDeliveryWeekdays"]);
  });

  it("refuses each number outside its range", () => {
    expect(f({ effyLookaheadDays: 0 })).toEqual(["effyLookaheadDays"]);
    expect(f({ effyLookaheadDays: 15 })).toEqual(["effyLookaheadDays"]);
    // ⚠ Required now (083): it is the only look-ahead there is.
    expect(f({ effyLookaheadDays: undefined })).toEqual(["effyLookaheadDays"]);
    expect(f({ slotHoldMin: 0 })).toEqual(["slotHoldMin"]);
    expect(f({ hubTurnaroundMin: 1.5 })).toEqual(["hubTurnaroundMin"]);
  });
});
