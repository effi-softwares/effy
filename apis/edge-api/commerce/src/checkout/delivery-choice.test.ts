import { describe, expect, it } from "vitest";

import { windowKey, type PricedFee, type QuoteResult } from "@effy/edge-shared/delivery";

import { DeliveryChoiceError, resolveAsap, resolveCourier, resolveEffyChoice, resolveEffyWindow } from "./delivery-choice";

/**
 * 085 — what a shopper's choice becomes. Pure: the quote is built here, so no clock and no database.
 *
 * The calendar: TODAY (Thu 8 Oct) and two later days. `evening` is a timed window; `anytime` is the
 * business's Any-time window (midday – 9 pm).
 */
type EffyQuote = Extract<QuoteResult, { coverage: "effy" }>;
type Day = EffyQuote["effyWindows"]["days"][number];

const NOW = new Date("2026-10-08T07:00:00+11:00");
const at = (date: string, hour: number) => new Date(`${date}T${String(hour).padStart(2, "0")}:00:00+11:00`);
const open = (id: string, date: string, start: number, end: number) => ({ id, date, start: at(date, start), end: at(date, end), cutoff: at(date, start - 2) });
const fee = (totalCents: number, slotId: string | null = null, windowIsToday = false): PricedFee =>
  ({ planId: "plan", planName: "Plan", slotId, windowIsToday, breakdown: { totalCents } as PricedFee["breakdown"], lines: [], totalCents });

const TODAY = "2026-10-08";
const FRI = "2026-10-09";
const SAT = "2026-10-10";
const BASE = fee(600);

function day(date: string, over: Partial<Day> = {}): Day {
  return {
    date, isToday: date === TODAY, nonDelivery: false,
    windows: [open("evening", date, 18, 20)], closedReason: null, anyTime: open("anytime", date, 12, 21),
    ...over,
  };
}

function quote(days: Day[], asap: EffyQuote["effyWindows"]["asap"] = { estimate: "usually within 2–3 days", fee: BASE }): EffyQuote {
  const fees = new Map<string, PricedFee>();
  for (const d of days) {
    for (const w of d.windows) fees.set(windowKey(w.id, d.date), fee(d.isToday ? 1100 : 800, w.id, d.isToday));
    if (d.anyTime) fees.set(windowKey(d.anyTime.id, d.date), BASE);
  }
  return {
    serviced: true, coverage: "effy", zoneId: null, shopIds: ["shop-a", "shop-b"], baseFee: BASE, freeDeliveryRemainingCents: null,
    effyWindows: { days, fees, unavailable: null, asap },
  };
}

const refusal = (fn: () => unknown): string => {
  try {
    fn();
  } catch (err) {
    if (err instanceof DeliveryChoiceError) return err.code;
    throw err;
  }
  return "accepted";
};

describe("a window — unchanged by 085", () => {
  const q = quote([day(TODAY), day(FRI), day(SAT)]);

  it("a timed window on a later day is promised the window", () => {
    const r = resolveEffyWindow(q, { slotId: "evening", date: FRI }, NOW);
    expect(r.promise).toBe("window");
    expect(r.asapEstimate).toBeNull();
    expect(r.fee.totalCents).toBe(800);
    expect(r.hold).toEqual({ slotId: "evening", date: FRI, now: NOW });
    expect(r.packages).toEqual(["shop-a", "shop-b"].map((shopId) => ({
      shopId, method: "standard", promisedDay: FRI, slotId: "evening", windowStart: at(FRI, 18), windowEnd: at(FRI, 20),
    })));
  });

  it("a window today is same-day", () => {
    const r = resolveEffyWindow(q, { slotId: "evening", date: TODAY }, NOW);
    expect(r.promise).toBe("window");
    expect(r.packages.every((p) => p.method === "same_day")).toBe(true);
    expect(r.fee.totalCents).toBe(1100);
  });

  it("no window, a window that has gone and a day that has gone are each refused — never replaced", () => {
    expect(refusal(() => resolveEffyWindow(q, null, NOW))).toBe("slot_required");
    expect(refusal(() => resolveEffyWindow(q, { slotId: "morning", date: FRI }, NOW))).toBe("slot_unavailable");
    expect(refusal(() => resolveEffyWindow(q, { slotId: "evening", date: "2026-10-20" }, NOW))).toBe("date_unavailable");
  });
});

describe("085 — a day with no time", () => {
  const q = quote([day(TODAY), day(FRI), day(SAT, { anyTime: null })]);

  it("is the day's Any-time window: bound, held and stored like any window, and promised the DAY", () => {
    const r = resolveEffyWindow(q, { slotId: "anytime", date: FRI }, NOW);
    expect(r.promise).toBe("day");
    expect(r.asapEstimate).toBeNull();
    expect(r.hold).toEqual({ slotId: "anytime", date: FRI, now: NOW });
    expect(r.packages).toEqual(["shop-a", "shop-b"].map((shopId) => ({
      shopId, method: "standard", promisedDay: FRI, slotId: "anytime", windowStart: at(FRI, 12), windowEnd: at(FRI, 21),
    })));
  });

  it("pays the plain fee — nothing for a window", () => {
    expect(resolveEffyWindow(q, { slotId: "anytime", date: FRI }, NOW).fee).toBe(BASE);
  });

  it("⚠ cannot be chosen for TODAY, even though today's Any-time window is open", () => {
    expect(q.effyWindows.days[0]!.anyTime).not.toBeNull();
    expect(refusal(() => resolveEffyWindow(q, { slotId: "anytime", date: TODAY }, NOW))).toBe("slot_unavailable");
  });

  it("a day with no untimed room left is refused, and its windows are still sold", () => {
    expect(refusal(() => resolveEffyWindow(q, { slotId: "anytime", date: SAT }, NOW))).toBe("slot_unavailable");
    expect(resolveEffyWindow(q, { slotId: "evening", date: SAT }, NOW).promise).toBe("window");
  });
});

describe("085 — as soon as possible", () => {
  it("lands on the FIRST day that can take an order with no time — today, when today can", () => {
    const r = resolveAsap(quote([day(TODAY), day(FRI), day(SAT)]), NOW);
    expect(r.promise).toBe("asap");
    expect(r.asapEstimate).toBe("usually within 2–3 days");
    expect(r.hold).toEqual({ slotId: "anytime", date: TODAY, now: NOW });
    expect(r.packages.every((p) => p.method === "same_day" && p.promisedDay === TODAY && p.slotId === "anytime")).toBe(true);
  });

  it("⚠ pays the plain fee even when it lands today — never the delivery-today premium", () => {
    const q = quote([day(TODAY), day(FRI)]);
    expect(resolveAsap(q, NOW).fee).toBe(BASE);
    expect(q.effyWindows.fees.get(windowKey("evening", TODAY))!.totalCents).toBeGreaterThan(BASE.totalCents);
  });

  it("skips a day that cannot take one, and is then an ordinary later-day delivery", () => {
    const r = resolveAsap(quote([day(TODAY, { anyTime: null }), day(FRI, { anyTime: null }), day(SAT)]), NOW);
    expect(r.hold.date).toBe(SAT);
    expect(r.packages.every((p) => p.method === "standard")).toBe(true);
  });

  it("is refused when no day can take one, or the business offers none — never turned into a window", () => {
    expect(refusal(() => resolveAsap(quote([day(TODAY, { anyTime: null }), day(FRI, { anyTime: null })]), NOW))).toBe("slot_unavailable");
    expect(refusal(() => resolveAsap(quote([day(TODAY), day(FRI)], null), NOW))).toBe("slot_unavailable");
  });
});

describe("085 — what an intent may send", () => {
  const q = quote([day(TODAY), day(FRI)]);
  const window = { slotId: "evening", date: FRI };

  it("a window alone, or as soon as possible alone", () => {
    expect(resolveEffyChoice(q, window, false, NOW).promise).toBe("window");
    expect(resolveEffyChoice(q, { slotId: "anytime", date: FRI }, false, NOW).promise).toBe("day");
    expect(resolveEffyChoice(q, null, true, NOW).promise).toBe("asap");
  });

  it("both, or neither, is no choice", () => {
    expect(refusal(() => resolveEffyChoice(q, window, true, NOW))).toBe("slot_required");
    expect(refusal(() => resolveEffyChoice(q, null, false, NOW))).toBe("slot_required");
  });

  it("with nothing to choose on any day, every choice says so", () => {
    const none: EffyQuote = { ...q, effyWindows: { ...q.effyWindows, unavailable: "no_windows" } };
    expect(refusal(() => resolveEffyChoice(none, window, false, NOW))).toBe("no_windows_available");
  });
});

describe("a courier order was sold none of these", () => {
  it("has no promise", () => {
    const r = resolveCourier({ fee: BASE } as Parameters<typeof resolveCourier>[0], [{ shopId: "shop-a", grams: 100 }]);
    expect(r.promise).toBeNull();
    expect(r.asapEstimate).toBeNull();
    expect(r.hold).toBeNull();
  });
});
