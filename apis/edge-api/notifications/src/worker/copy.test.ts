import { describe, expect, it } from "vitest";

import { copyFor, dataFor, deepLinkFor, type NotificationType } from "./copy";

// Wire contract (research R6, 028 precedent): the FCM `data` block the worker sends is what the mobile
// deep-link handler parses. These pins fail loudly if a key or a deep-link shape drifts from what the
// three apps route on. All values are NON-PII (FR-021).

const ALL: NotificationType[] = [
  "order_paid",
  "order_ready",
  "order_out_for_delivery",
  "order_delivered",
  "shop_new_order",
  "run_assigned",
];

describe("notification copy + wire contract", () => {
  it("every type has non-empty, PII-free copy", () => {
    for (const t of ALL) {
      const c = copyFor(t);
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.body.length).toBeGreaterThan(0);
      expect(c.deepLinkPath.length).toBeGreaterThan(0);
    }
  });

  it("the data block carries exactly type/entityId/deepLink (the keys the apps read)", () => {
    const d = dataFor("order_paid", "order-123");
    expect(Object.keys(d).sort()).toEqual(["deepLink", "entityId", "type"]);
    expect(d.type).toBe("order_paid");
    expect(d.entityId).toBe("order-123");
    // FCM data values must all be strings.
    for (const v of Object.values(d)) expect(typeof v).toBe("string");
  });

  it("deep links route to the family each audience expects (FR-017)", () => {
    // Customer order events → the order screen.
    expect(deepLinkFor("order_paid", "o1")).toBe("effy://order/o1");
    expect(deepLinkFor("order_ready", "o1")).toBe("effy://order/o1");
    expect(deepLinkFor("order_out_for_delivery", "o1")).toBe("effy://order/o1");
    expect(deepLinkFor("order_delivered", "o1")).toBe("effy://order/o1");
    // Shop → the pick queue; driver → the assigned run.
    expect(deepLinkFor("shop_new_order", "f1")).toBe("effy://queue/f1");
    expect(deepLinkFor("run_assigned", "r1")).toBe("effy://run/r1");
  });
});
