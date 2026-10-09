import { describe, expect, it } from "vitest";

import { judgePromise, type PromiseFacts } from "./promise";

// A package a carrier takes, from an order placed before 079 (it was promised a DAY).
const base: PromiseFacts = {
  deliveredBy: "courier",
  courierOrder: false,
  placedDate: "2026-10-05",
  promisedDate: "2026-10-08",
  windowEnd: null,
  today: "2026-10-06",
  handoffDate: null,
  arrivedAt: null,
  arrivalDate: null,
};

describe("judgePromise — 078: a standard package that was sold a window is Effy's", () => {
  // ⚠ 079 — WHO delivers is `public.package_delivered_by`'s answer, handed in; this file no longer
  // works it out from the method and the window.
  const windowed: PromiseFacts = { ...base, deliveredBy: "effy", windowEnd: new Date("2026-10-08T07:00:00Z") };

  it("is never due for a carrier handover and never at risk for want of one", () => {
    expect(judgePromise(windowed)).toEqual({ handoverDueOn: null, atRisk: false, onTime: null });
    expect(judgePromise({ ...windowed, today: "2026-10-20" }).atRisk).toBe(false);
  });

  it("is on time inside its window, not merely on its day", () => {
    const arrived = (iso: string) => judgePromise({ ...windowed, arrivedAt: new Date(iso), arrivalDate: "2026-10-08" }).onTime;
    expect(arrived("2026-10-08T07:00:00Z")).toBe(true);
    expect(arrived("2026-10-08T07:00:01Z")).toBe(false);
  });
});

/**
 * ⚠ 083 — "the promised day less the carrier's lead time" WENT WITH THE OLD ARRANGEMENT. A carrier's
 * package from before delivery types has no due-out day and is never at risk: every such order was
 * finished before the rule was removed (the migration refused otherwise), so there is nothing left to
 * chase. What it was promised still judges whether it ARRIVED on time — history reads as it did.
 */
describe("judgePromise — a carrier's package from before delivery types", () => {
  it("has no due-out day and is never at risk, however late today is", () => {
    expect(judgePromise(base)).toEqual({ handoverDueOn: null, atRisk: false, onTime: null });
    expect(judgePromise({ ...base, today: "2026-12-01" }).atRisk).toBe(false);
    expect(judgePromise({ ...base, today: "2026-12-01", handoffDate: "2026-11-30" }).atRisk).toBe(false);
  });

  it("is still judged on the day it was promised once it has arrived", () => {
    const late = judgePromise({ ...base, today: "2026-10-10", handoffDate: "2026-10-08", arrivedAt: new Date("2026-10-09T03:00:00Z"), arrivalDate: "2026-10-09" });
    expect(late).toMatchObject({ atRisk: false, onTime: false });
    const early = judgePromise({ ...base, handoffDate: "2026-10-06", arrivedAt: new Date("2026-10-07T03:00:00Z"), arrivalDate: "2026-10-07" });
    expect(early.onTime).toBe(true);
  });

  it("has no verdict until it arrives", () => {
    expect(judgePromise(base).onTime).toBeNull();
  });
});

describe("judgePromise — a same-day package", () => {
  const sameDay: PromiseFacts = {
    ...base, deliveredBy: "effy", promisedDate: "2026-10-06", windowEnd: new Date("2026-10-06T08:00:00Z"),
  };

  it("is never due for a carrier handover and never at risk of missing one", () => {
    const v = judgePromise({ ...sameDay, today: "2026-10-09" });
    expect(v.handoverDueOn).toBeNull();
    expect(v.atRisk).toBe(false);
  });

  it("is on time up to and including the end of its window", () => {
    const at = (iso: string) => judgePromise({ ...sameDay, arrivedAt: new Date(iso), arrivalDate: "2026-10-06" }).onTime;
    expect(at("2026-10-06T07:30:00Z")).toBe(true);
    expect(at("2026-10-06T08:00:00Z")).toBe(true);
    expect(at("2026-10-06T08:00:01Z")).toBe(false);
  });
});

describe("judgePromise — an order placed before 069", () => {
  const old: PromiseFacts = { ...base, promisedDate: null };

  it("is promised nothing, so it is never at risk and never late", () => {
    const pending = judgePromise({ ...old, today: "2027-01-01" });
    expect(pending).toEqual({ handoverDueOn: null, atRisk: false, onTime: null });

    const arrived = judgePromise({ ...old, arrivedAt: new Date("2026-10-20T00:00:00Z"), arrivalDate: "2026-10-20" });
    expect(arrived.onTime).toBeNull();
  });
});

describe("judgePromise — 079: an order sold as a courier delivery was promised no day", () => {
  const courier: PromiseFacts = { ...base, courierOrder: true, promisedDate: null, placedDate: "2026-10-06", today: "2026-10-06" };

  it("is due at the carrier the day it was placed, and at risk from the next", () => {
    expect(judgePromise(courier)).toEqual({ handoverDueOn: "2026-10-06", atRisk: false, onTime: null });
    expect(judgePromise({ ...courier, today: "2026-10-07" }).atRisk).toBe(true);
    expect(judgePromise({ ...courier, today: "2026-10-09", handoffDate: "2026-10-06" }).atRisk).toBe(false);
  });

  it("is never judged on time or late: it was told an estimate, not a date", () => {
    expect(judgePromise({ ...courier, arrivedAt: new Date("2026-10-20T03:00:00Z"), arrivalDate: "2026-10-20" }).onTime).toBeNull();
  });

  it("a carrier package from before 069 has no promised day either — and nothing to be due by", () => {
    expect(judgePromise({ ...base, promisedDate: null, today: "2026-12-01" })).toEqual({ handoverDueOn: null, atRisk: false, onTime: null });
  });

  it("the order's type does not make an Effy-delivered package a carrier's", () => {
    expect(judgePromise({ ...courier, deliveredBy: "effy", today: "2026-10-30" })).toEqual({ handoverDueOn: null, atRisk: false, onTime: null });
  });
});
