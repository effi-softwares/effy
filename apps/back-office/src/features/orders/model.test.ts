import { describe, expect, it } from "vitest";

import type { OrderPackage } from "./model";
import { nextActionFor, packagePositionFor, PROMISE_FLAG_LABEL, promiseFlagsFor, promiseTextFor } from "./model";

const pkg = (over: Partial<OrderPackage> = {}): OrderPackage => ({
  fulfillmentId: "f1",
  shopId: "s1",
  shopName: "Shop One",
  status: "collected",
  itemCount: 2,
  subtotalAmount: "20.00",
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
    expect(nextActionFor(pkg({ deliveryMethod: "same_day" }))).toBe("none");
  });

  it("offers nothing while the package is still at its shop", () => {
    for (const status of ["pending", "received", "picking", "ready_for_pickup"]) {
      expect(nextActionFor(pkg({ status }))).toBe("none");
    }
  });
});

describe("packagePositionFor — what the operator reads", () => {
  it("distinguishes packed-at-shop from left-the-shop", () => {
    // ⚠ The distinction 053 corrected for the customer, mirrored for the operator: `ready_for_pickup`
    // is waiting on a shelf, not departed.
    expect(packagePositionFor(pkg({ status: "ready_for_pickup" }))).toBe("Packed at shop");
    expect(packagePositionFor(pkg({ status: "collected" }))).toBe("At hub");
  });

  it("says a same-day collected package is out for delivery, not at a hub", () => {
    expect(packagePositionFor(pkg({ status: "collected", deliveryMethod: "same_day" }))).toBe(
      "Out for delivery",
    );
  });

  it("reads the same whether or not a carrier reference was recorded (FR-003)", () => {
    expect(packagePositionFor(pkg({ handoff: handoff(null) }))).toBe("With carrier");
    expect(packagePositionFor(pkg({ handoff: handoff("ABC123") }))).toBe("With carrier");
  });

  it("says Arrived once it has", () => {
    expect(packagePositionFor(pkg({ handoff: handoff(), arrival: arrival() }))).toBe("Arrived");
  });
});

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
