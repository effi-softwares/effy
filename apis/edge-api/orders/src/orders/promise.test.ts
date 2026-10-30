import { describe, expect, it } from "vitest";

import { judgePromise, type PromiseFacts } from "./promise";

/** An Effy package sold a window on 8 October. */
const effy: PromiseFacts = {
  deliveredBy: "effy",
  placedDate: "2026-10-05",
  promisedDate: "2026-10-08",
  windowEnd: new Date("2026-10-08T07:00:00Z"),
  today: "2026-10-06",
  handoffDate: null,
  arrivedAt: null,
  arrivalDate: null,
};

describe("judgePromise - a package Effy delivers", () => {
  it("is never due for a carrier handover and never at risk for want of one", () => {
    expect(judgePromise(effy)).toEqual({ handoverDueOn: null, atRisk: false, onTime: null });
    expect(judgePromise({ ...effy, today: "2026-10-20" }).atRisk).toBe(false);
  });

  it("is on time up to and including the end of its window, not merely on its day", () => {
    const at = (iso: string) => judgePromise({ ...effy, arrivedAt: new Date(iso), arrivalDate: "2026-10-08" }).onTime;
    expect(at("2026-10-08T06:30:00Z")).toBe(true);
    expect(at("2026-10-08T07:00:00Z")).toBe(true);
    expect(at("2026-10-08T07:00:01Z")).toBe(false);
  });
});

describe("judgePromise - 079: an order sold as a courier delivery was promised no day", () => {
  const courier: PromiseFacts = { ...effy, deliveredBy: "courier", promisedDate: null, windowEnd: null, placedDate: "2026-10-06", today: "2026-10-06" };

  it("with no pickup to ask about, is due at the carrier the day it was placed, and at risk from the next", () => {
    expect(judgePromise(courier)).toEqual({ handoverDueOn: "2026-10-06", atRisk: false, onTime: null });
    expect(judgePromise({ ...courier, today: "2026-10-07" }).atRisk).toBe(true);
    expect(judgePromise({ ...courier, today: "2026-10-09", handoffDate: "2026-10-06" }).atRisk).toBe(false);
  });

  it("080 - is due out by its service's next pickup, and late past that instant", () => {
    const pickup = new Date("2026-10-07T05:00:00Z");
    const f = { ...courier, courierDueOut: pickup };
    expect(judgePromise({ ...f, now: new Date("2026-10-07T04:00:00Z") })).toMatchObject({ handoverDueOn: "2026-10-07", atRisk: false });
    expect(judgePromise({ ...f, now: new Date("2026-10-07T06:00:00Z") }).atRisk).toBe(true);
    expect(judgePromise({ ...f, now: new Date("2026-10-08T00:00:00Z"), handoffAt: new Date("2026-10-07T04:30:00Z") }).atRisk).toBe(false);
  });

  it("is never judged on time or late: it was told an estimate, not a date", () => {
    expect(judgePromise({ ...courier, arrivedAt: new Date("2026-10-20T03:00:00Z"), arrivalDate: "2026-10-20" }).onTime).toBeNull();
  });
});
