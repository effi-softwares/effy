import { describe, expect, it } from "vitest";

import { judgePromise, minusDays, type PromiseFacts } from "./promise";

const base: PromiseFacts = {
  method: "standard",
  promisedDate: "2026-10-08",
  windowEnd: null,
  today: "2026-10-06",
  handoffDate: null,
  arrivedAt: null,
  arrivalDate: null,
  carrierLeadDays: 1,
};

describe("minusDays", () => {
  it("crosses a month and a year without a timezone", () => {
    expect(minusDays("2026-10-01", 1)).toBe("2026-09-30");
    expect(minusDays("2027-01-01", 2)).toBe("2026-12-30");
    expect(minusDays("2026-10-08", 0)).toBe("2026-10-08");
  });

  it("is unaffected by the day daylight saving starts", () => {
    expect(minusDays("2026-10-05", 1)).toBe("2026-10-04");
    expect(minusDays("2026-10-04", 1)).toBe("2026-10-03");
  });
});

describe("judgePromise — 078: a standard package that was sold a window is Effy's", () => {
  const windowed: PromiseFacts = { ...base, windowEnd: new Date("2026-10-08T07:00:00Z") };

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

describe("judgePromise — a standard package", () => {
  it("is due for handover the carrier's lead time before its day", () => {
    expect(judgePromise(base).handoverDueOn).toBe("2026-10-07");
    expect(judgePromise({ ...base, carrierLeadDays: 3 }).handoverDueOn).toBe("2026-10-05");
    expect(judgePromise({ ...base, carrierLeadDays: 0 }).handoverDueOn).toBe("2026-10-08");
  });

  it("is not at risk before or on its due day", () => {
    expect(judgePromise({ ...base, today: "2026-10-06" }).atRisk).toBe(false);
    expect(judgePromise({ ...base, today: "2026-10-07" }).atRisk).toBe(false);
  });

  it("is at risk once the due day has passed with no handover", () => {
    expect(judgePromise({ ...base, today: "2026-10-08" }).atRisk).toBe(true);
  });

  it("is not at risk when it was handed over in time, however long ago", () => {
    expect(judgePromise({ ...base, today: "2026-10-12", handoffDate: "2026-10-07" }).atRisk).toBe(false);
  });

  it("is at risk when it was handed over late", () => {
    expect(judgePromise({ ...base, today: "2026-10-08", handoffDate: "2026-10-08" }).atRisk).toBe(true);
  });

  it("stops being at risk once it has arrived, and is judged on its day instead", () => {
    const late = judgePromise({
      ...base, today: "2026-10-10", handoffDate: "2026-10-08",
      arrivedAt: new Date("2026-10-09T03:00:00Z"), arrivalDate: "2026-10-09",
    });
    expect(late.atRisk).toBe(false);
    expect(late.onTime).toBe(false);

    const early = judgePromise({
      ...base, handoffDate: "2026-10-06",
      arrivedAt: new Date("2026-10-07T03:00:00Z"), arrivalDate: "2026-10-07",
    });
    expect(early.onTime).toBe(true);
  });

  it("has no verdict until it arrives", () => {
    expect(judgePromise(base).onTime).toBeNull();
  });
});

describe("judgePromise — a same-day package", () => {
  const sameDay: PromiseFacts = {
    ...base, method: "same_day", promisedDate: "2026-10-06", windowEnd: new Date("2026-10-06T08:00:00Z"),
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
