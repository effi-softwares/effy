import { describe, expect, it } from "vitest";

import {
  COUNTED_REFUND_STATUSES, countsAsRefundedToCustomer, customerCancellable, customerRefundState, stageFor,
} from "./order-completion";

/**
 * 070 — the ONE implementation of what a customer is told about their order. Until 070 this rule
 * lived in the Go backend and a second copy here was kept honest by a test that read the Go source;
 * these are that backend's own table tests, now pinned on the only copy there is.
 */
describe("stageFor", () => {
  it.each([
    ["no packages yet is confirmed", [], "confirmed"],
    ["a single pending package is confirmed", ["pending"], "confirmed"],
    ["received is packing", ["received"], "packing"],
    ["picking is packing", ["picking"], "packing"],
    ["ready_for_pickup is still packing", ["ready_for_pickup"], "packing"],
    ["collected is on the way", ["collected"], "on_the_way"],
    ["delivered is delivered", ["delivered"], "delivered"],
    ["every package delivered is delivered", ["delivered", "delivered"], "delivered"],
    ["a packed package holds the order at packing", ["ready_for_pickup", "collected"], "packing"],
  ] as const)("%s", (_name, statuses, want) => {
    expect(stageFor(statuses)).toBe(want);
  });

  it("is a rollup, not a max", () => {
    // A max would tell a shopper their shopping is on the doorstep while half of it is being picked.
    expect(stageFor(["delivered", "picking"])).toBe("packing");
    expect(stageFor(["delivered", "pending"])).toBe("confirmed");
  });

  it("holds 053's correction: packed and waiting at the shop has not left", () => {
    expect(stageFor(["ready_for_pickup"])).toBe("packing");
    expect(stageFor(["collected"])).toBe("on_the_way");
  });

  it("never lets an unknown status advance the order", () => {
    expect(stageFor(["teleported"])).toBe("confirmed");
    expect(stageFor(["delivered", "teleported"])).toBe("confirmed");
  });
});

describe("customerCancellable", () => {
  it("is offered only on a paid order no shop has started", () => {
    expect(customerCancellable("paid", [])).toBe(true); // paid, not yet fanned out
    expect(customerCancellable("paid", ["pending", "pending"])).toBe(true);
    expect(customerCancellable("paid", ["pending", "picking"])).toBe(false); // ANY shop beginning closes it
    expect(customerCancellable("paid", ["received"])).toBe(false);
  });

  it("is never offered on an order that is not paid", () => {
    for (const status of ["pending_payment", "failed", "canceled", "cancelled"]) {
      expect(customerCancellable(status, [])).toBe(false);
    }
  });
});

describe("refund states", () => {
  it("collapses five internal states to three, and an unknown one is never 'completed'", () => {
    expect(customerRefundState("submitting")).toBe("on_its_way");
    expect(customerRefundState("submitted")).toBe("on_its_way");
    expect(customerRefundState("succeeded")).toBe("completed");
    expect(customerRefundState("failed")).toBe("there_was_a_problem");
    expect(customerRefundState("refused")).toBe("there_was_a_problem");
    expect(customerRefundState("something_new")).toBe("on_its_way");
  });

  it("the ceiling never counts an unsettled or refused attempt, and does count a failed one", () => {
    expect([...COUNTED_REFUND_STATUSES].sort()).toEqual(["failed", "submitted", "succeeded"]);
  });

  it("the shopper's refunded total counts only money that left or is leaving", () => {
    expect(countsAsRefundedToCustomer("submitted")).toBe(true);
    expect(countsAsRefundedToCustomer("succeeded")).toBe(true);
    expect(countsAsRefundedToCustomer("submitting")).toBe(false);
    // ⚠ Where it differs from the ceiling: a failed refund did not reach the shopper.
    expect(countsAsRefundedToCustomer("failed")).toBe(false);
    expect(countsAsRefundedToCustomer("refused")).toBe(false);
  });
});
