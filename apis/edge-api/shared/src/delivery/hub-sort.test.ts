import { describe, expect, it } from "vitest";

import { hubSortOf } from "./hub-sort";

/** 090 — the hub instruction per package (quickstart P5). 2026-10-16 01:00Z is noon in Melbourne. */
const AT = new Date("2026-10-16T01:00:00Z");

describe("hubSortOf", () => {
  it("a courier parcel goes to the courier bay", () => {
    expect(hubSortOf({ deliveredBy: "courier", windowStart: null, windowEnd: null }, AT)).toEqual({ kind: "courier_bay", label: "COURIER BAY" });
  });

  it("an Effy parcel for a window today goes out now, with the window's words", () => {
    const s = hubSortOf({ deliveredBy: "effy", windowStart: new Date("2026-10-16T05:00:00Z"), windowEnd: new Date("2026-10-16T07:00:00Z") }, AT);
    expect(s.kind).toBe("load_now");
    expect(s.label).toMatch(/^LOAD NOW · /);
  });

  it("an Effy parcel for a later day waits on a shelf, with the day's words", () => {
    const s = hubSortOf({ deliveredBy: "effy", windowStart: new Date("2026-10-18T05:00:00Z"), windowEnd: new Date("2026-10-18T07:00:00Z") }, AT);
    expect(s.kind).toBe("shelve");
    expect(s.label).toMatch(/^SHELVE · /);
  });

  it("an Effy parcel sold no window goes out now", () => {
    expect(hubSortOf({ deliveredBy: "effy", windowStart: null, windowEnd: null }, AT).kind).toBe("load_now");
  });
});
