import { parseDestination } from "@effy/shared-types";
import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_TYPES,
  catalogueEntry,
  destinationFor,
  isKnownNotificationType,
  type NotificationCategory,
  type NotificationType,
  wordsFor,
} from "./catalogue";

// Written out, not imported, so adding a type without adding it here fails the exhaustiveness check.
const ALL: NotificationType[] = [
  "order_paid", "order_ready", "order_out_for_delivery", "order_delivered", "shop_new_order", "run_assigned",
  "shop_awaiting_pick", "shop_out_of_stock", "shop_low_stock", "shop_refund_proposed", "shop_product_approved",
  "shop_product_sent_back", "shop_product_held", "shop_product_released", "shop_product_added_by_effy",
  "shop_products_imported", "points_credited", "points_expiring", "order_with_courier", "order_delivery_changed",
  "run_changed", "run_withdrawn", "run_opens_soon", "driver_runs_today",
];

/** Pinned above a person's inbox (110); every other type is normal. */
const IMPORTANT: NotificationType[] = ["driver_runs_today"];

const CATEGORIES_BY_AUDIENCE: Record<"customer" | "driver" | "shop", NotificationCategory[]> = {
  customer: ["orders", "points", "offers", "news", "important", "support"],
  driver: ["work", "announcements", "important"],
  shop: ["orders", "stock", "products", "announcements", "important"],
};

/** A subject that satisfies every destination: each id named so the expectations below can check which one is used. */
const SUBJECT = { entityId: "e1", orderId: "o1" };

describe("notification catalogue (109)", () => {
  it("is exhaustive - no type ships without words, and none is left untested", () => {
    expect([...NOTIFICATION_TYPES].sort()).toEqual([...ALL].sort());
  });

  it("every type has words, a tag, a category valid for its audience, and the importance it is meant to have", () => {
    for (const t of ALL) {
      const e = catalogueEntry(t);
      expect(e.title.length, t).toBeGreaterThan(0);
      expect(e.title.length, t).toBeLessThanOrEqual(120);
      expect(e.body.length, t).toBeGreaterThan(0);
      expect(e.body.length, t).toBeLessThanOrEqual(500);
      expect(e.tag.length, t).toBeGreaterThan(0);
      expect(CATEGORIES_BY_AUDIENCE[e.audience], `${t} category ${e.category}`).toContain(e.category);
      expect(e.importance, t).toBe(IMPORTANT.includes(t) ? "important" : "normal");
    }
  });

  it("every type's destination is one its own audience can open (FR-011)", () => {
    for (const t of ALL) {
      const e = catalogueEntry(t);
      const d = destinationFor(t, SUBJECT);
      expect(parseDestination(e.audience, d), `${t} → ${JSON.stringify(d)}`).toEqual(d);
    }
  });

  it("every order notification opens the order itself, including the courier and change ones", () => {
    for (const t of ["order_paid", "order_ready", "order_out_for_delivery", "order_delivered"] as const) {
      expect(destinationFor(t, { entityId: "o9" })).toEqual({ kind: "order", orderId: "o9" });
    }
    // The entity is a consignment / a move, not the order: the order id is given separately.
    expect(destinationFor("order_with_courier", { entityId: "consignment-1", orderId: "o1" })).toEqual({ kind: "order", orderId: "o1" });
    expect(destinationFor("order_delivery_changed", { entityId: "move-1", orderId: "o1" })).toEqual({ kind: "order", orderId: "o1" });
    expect(() => destinationFor("order_with_courier", { entityId: "consignment-1" })).toThrow(/order id/);
  });

  it("points open points; runs open the run; a removed run opens Today", () => {
    expect(destinationFor("points_credited", { entityId: "entry-1" })).toEqual({ kind: "points" });
    expect(destinationFor("points_expiring", { entityId: "notice-1" })).toEqual({ kind: "points" });
    for (const t of ["run_assigned", "run_changed", "run_opens_soon"] as const) {
      expect(destinationFor(t, { entityId: "r1" })).toEqual({ kind: "run", runId: "r1" });
    }
    expect(destinationFor("run_withdrawn", { entityId: "r1" })).toEqual({ kind: "today" });
    expect(destinationFor("driver_runs_today", { entityId: "2026-11-09", count: 2 })).toEqual({ kind: "today" });
  });

  it("the catch-up notice says how many runs, in the singular for one (110)", () => {
    expect(wordsFor("driver_runs_today", { entityId: "d", count: 1 })).toEqual({ title: "You have 1 run today", body: "Open Today to see what's first." });
    expect(wordsFor("driver_runs_today", { entityId: "d", count: 3 }).title).toBe("You have 3 runs today");
    expect(wordsFor("order_paid", { entityId: "o" })).toEqual({ title: catalogueEntry("order_paid").title, body: catalogueEntry("order_paid").body });
  });

  it("shop notifications open the queue, the order, the product or the catalogue", () => {
    expect(destinationFor("shop_new_order", { entityId: "f1" })).toEqual({ kind: "queue", fulfillmentId: "f1" });
    expect(destinationFor("shop_refund_proposed", { entityId: "f1" })).toEqual({ kind: "queue", fulfillmentId: "f1" });
    expect(destinationFor("shop_awaiting_pick", { entityId: "" })).toEqual({ kind: "queue" });
    for (const t of [
      "shop_out_of_stock", "shop_low_stock", "shop_product_approved", "shop_product_sent_back", "shop_product_held",
      "shop_product_released", "shop_product_added_by_effy",
    ] as const) {
      expect(destinationFor(t, { entityId: "p1" })).toEqual({ kind: "product", productId: "p1" });
    }
    expect(destinationFor("shop_products_imported", { entityId: "import-1" })).toEqual({ kind: "catalog" });
  });

  it("customers are told things in customer words (FR-026, FR-027)", () => {
    expect(catalogueEntry("order_ready").title).toBe("Your order is packed");
    expect(catalogueEntry("order_ready").body).toBe("It will be on its way to you soon.");
    const internal = /handoff|hand-off|\bhub\b|fulfil+ment|\bpackages?\b|\bparcels?\b|\bruns?\b|\bshops?\b/i;
    for (const t of ALL.filter((x) => catalogueEntry(x).audience === "customer")) {
      const e = catalogueEntry(t);
      expect(`${e.title} ${e.body}`, t).not.toMatch(internal);
    }
  });

  it("carries no PII, amount or placeholder on any lock screen (FR-028)", () => {
    const forbidden = [/@/, /\$/, /\d/, /\bstreet\b/i, /\bcustomer\b/i, /\bmr\b/i, /\bms\b/i, /\{/, /because|reason:/i];
    for (const t of ALL) {
      const e = catalogueEntry(t);
      for (const re of forbidden) {
        expect(e.title, `${t} title`).not.toMatch(re);
        expect(e.body, `${t} body`).not.toMatch(re);
      }
    }
  });

  it("recognises only the types this build knows (the database-boundary guard)", () => {
    for (const t of ALL) expect(isKnownNotificationType(t)).toBe(true);
    expect(isKnownNotificationType("shop_something_a_later_slice_adds")).toBe(false);
    expect(isKnownNotificationType("")).toBe(false);
    expect(isKnownNotificationType("toString")).toBe(false);
    expect(isKnownNotificationType("constructor")).toBe(false);
  });
});
