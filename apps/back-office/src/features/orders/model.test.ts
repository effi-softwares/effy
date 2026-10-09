import { describe, expect, it } from "vitest";

import type { OrderPackage } from "./model";
import {
  deliveryChangeText, deliveryTypeText, nextActionFor, packageDeliveryText, PROMISE_FLAG_LABEL, promiseFlagsFor, promiseTextFor,
} from "./model";

const pkg = (over: Partial<OrderPackage> = {}): OrderPackage => ({
  statusView: null,
  collect: null,
  deliver: null,
  fulfillmentId: "f1",
  shopId: "s1",
  shopName: "Shop One",
  status: "collected",
  itemCount: 2,
  subtotalAmount: "20.00",
  // A carrier's package from an order placed before delivery types: who delivers is the SERVER's answer.
  deliveredBy: "courier",
  deliveryMethod: "standard",
  handoff: null,
  arrival: null,
  promisedDate: null,
  window: null,
  overCapacity: false,
  handoverDueOn: null,
  atRisk: false,
  onTime: null,
  ...over,
});

const handoff = (reference: string | null = null) => ({
  reference,
  carrierName: null,
  handedOverAt: "2026-08-26T01:00:00.000Z",
  recordedBySub: "staff-1",
  note: null,
});

const arrival = () => ({
  arrivedAt: "2026-08-26T05:00:00.000Z",
  source: "staff_recorded" as const,
  recordedBySub: "staff-1",
  note: null,
});

describe("nextActionFor — which control the operator is offered", () => {
  it("offers a handover on a collected standard package", () => {
    expect(nextActionFor(pkg())).toBe("handoff");
  });

  it("078 — offers nothing on a standard package that was sold a window: Effy delivers it", () => {
    const window = { startAt: "2026-10-09T16:00:00+11:00", endAt: "2026-10-09T18:00:00+11:00" };
    expect(nextActionFor(pkg({ deliveredBy: "effy", promisedDate: "2026-10-09", window }))).toBe("none");
    expect(promiseTextFor(pkg({ promisedDate: "2026-10-09", window }))).toBe("Fri 9 Oct, 4 pm – 6 pm");
  });

  /**
   * ⚠ 079 — WHO DELIVERS IS THE SERVER'S ANSWER. The console no longer works it out from the method
   * and the window, so the two cases that used to need care here are simply what `deliveredBy` says:
   * a paid Effy order moved to a courier keeps its window and IS handed over; an Effy package with
   * no window recorded is not.
   */
  it("079 — follows `deliveredBy`, not the method or the window", () => {
    const window = { startAt: "2026-10-09T16:00:00+11:00", endAt: "2026-10-09T18:00:00+11:00" };
    expect(nextActionFor(pkg({ deliveredBy: "courier", window }))).toBe("handoff");
    expect(nextActionFor(pkg({ deliveredBy: "courier", deliveryMethod: "same_day", window }))).toBe("handoff");
    expect(nextActionFor(pkg({ deliveredBy: "effy", deliveryMethod: "standard", window: null }))).toBe("none");
  });

  it("079 — a package row says who delivers it, and the customer's word only where Effy does", () => {
    expect(packageDeliveryText(pkg({ deliveredBy: "courier" }))).toBe("Courier delivery");
    expect(packageDeliveryText(pkg({ deliveredBy: "effy", deliveryMethod: "same_day" }))).toBe("Delivered by Effy · Same-day");
    expect(packageDeliveryText(pkg({ deliveredBy: "effy", deliveryMethod: "standard" }))).toBe("Delivered by Effy · Standard");
    expect(packageDeliveryText(pkg({ deliveredBy: "effy", deliveryMethod: null }))).toBe("Delivered by Effy");
  });

  it("079 — an order's delivery type and its changes, in the customer's two names", () => {
    expect(deliveryTypeText("effy")).toBe("Delivered by Effy");
    expect(deliveryTypeText("courier")).toBe("Courier delivery");
    expect(deliveryTypeText(null)).toBe("—");
    const at = "2026-10-09T03:00:00Z";
    expect(deliveryChangeText({ from: null, to: "courier", reason: "out_of_coverage", actor: { kind: "checkout" }, note: null, at })).toBe("Courier delivery");
    expect(deliveryChangeText({ from: "effy", to: "courier", reason: "staff_change", actor: { kind: "staff", sub: "s" }, note: null, at }))
      .toBe("Delivered by Effy → Courier delivery");
  });

  it("offers an arrival once the handover is recorded", () => {
    expect(nextActionFor(pkg({ handoff: handoff() }))).toBe("arrival");
  });

  /**
   * ⚠ FR-003 / SC-009. A handover with NO reference must behave EXACTLY like one with a reference.
   * If a missing reference left the package still offering "record handover", an operator would
   * record it twice looking for the field to stick.
   */
  it("treats a handover with no carrier reference as complete", () => {
    expect(nextActionFor(pkg({ handoff: handoff(null) }))).toBe("arrival");
    expect(nextActionFor(pkg({ handoff: handoff("ABC123") }))).toBe("arrival");
  });

  it("offers nothing once the package has arrived", () => {
    expect(nextActionFor(pkg({ handoff: handoff(), arrival: arrival() }))).toBe("none");
  });

  /** A same-day package is delivered by an Effy driver and never passes to a carrier. */
  it("offers no handover on a same-day package", () => {
    expect(nextActionFor(pkg({ deliveredBy: "effy", deliveryMethod: "same_day" }))).toBe("none");
  });

  it("offers nothing while the package is still at its shop", () => {
    for (const status of ["pending", "received", "picking", "ready_for_pickup"]) {
      expect(nextActionFor(pkg({ status }))).toBe("none");
    }
  });
});

// 073 — `packagePositionFor` is gone. It guessed position from the shop's status and said "At hub"
// the moment a driver picked a package up; the status is now derived on the server and pinned by
// `apis/edge-api/shared/src/status/status.test.ts` and the orders service's status container test.

describe("069 — what a package was promised", () => {
  it("says a standard package's day, and a same-day package's day and window", () => {
    expect(promiseTextFor(pkg({ promisedDate: "2026-10-13" }))).toBe("Tue 13 Oct");
    expect(
      promiseTextFor(
        pkg({
          deliveryMethod: "same_day",
          promisedDate: "2026-10-08",
          window: { startAt: "2026-10-08T17:00:00+11:00", endAt: "2026-10-08T19:00:00+11:00" },
        }),
      ),
    ).toBe("Thu 8 Oct, 5 pm – 7 pm");
  });

  it("⚠ says NOTHING for an order promised nothing — not a dash, not 'unknown'", () => {
    expect(promiseTextFor(pkg())).toBeNull();
    expect(promiseFlagsFor(pkg())).toEqual([]);
  });

  it("flags what staff should notice, and only that", () => {
    expect(promiseFlagsFor(pkg({ promisedDate: "2026-10-13", atRisk: true }))).toEqual(["at_risk"]);
    expect(promiseFlagsFor(pkg({ promisedDate: "2026-10-13", onTime: false }))).toEqual(["late"]);
    expect(promiseFlagsFor(pkg({ promisedDate: "2026-10-13", onTime: true }))).toEqual(["on_time"]);
    expect(promiseFlagsFor(pkg({ promisedDate: "2026-10-08", overCapacity: true }))).toEqual(["over_capacity"]);
    // Not yet arrived: no verdict either way.
    expect(promiseFlagsFor(pkg({ promisedDate: "2026-10-13", onTime: null }))).toEqual([]);
  });

  it("has wording for every flag, and never the raw key", () => {
    for (const [key, label] of Object.entries(PROMISE_FLAG_LABEL)) {
      expect(label, key).toBeTruthy();
      expect(label).not.toMatch(/_/);
    }
  });
});
