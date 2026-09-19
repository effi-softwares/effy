import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_TYPES,
  copyFor,
  dataFor,
  deepLinkFor,
  isKnownNotificationType,
  webPathFor,
  type NotificationType,
} from "./copy";

// Wire contract (research R6, 028 precedent): the FCM `data` block the worker sends is what the mobile
// deep-link handler parses. These pins fail loudly if a key or a deep-link shape drifts from what the
// three apps route on. All values are NON-PII (FR-021).

// ⚠ WRITTEN OUT, NOT IMPORTED FROM `NOTIFICATION_TYPES`. A list derived from the implementation
// agrees with the implementation by construction and proves nothing — 027's R13 lesson. Adding a
// type without adding it here is intended to fail the exhaustiveness check below.
const ALL: NotificationType[] = [
  "order_paid",
  "order_ready",
  "order_out_for_delivery",
  "order_delivered",
  "shop_new_order",
  "run_assigned",
  // 059
  "shop_awaiting_pick",
  "shop_out_of_stock",
  "shop_low_stock",
  "shop_refund_proposed",
];

describe("notification copy + wire contract", () => {
  it("the catalogue is exhaustive — no type ships without copy, and none is left untested", () => {
    expect([...NOTIFICATION_TYPES].sort()).toEqual([...ALL].sort());
  });

  it("every type has non-empty, PII-free copy", () => {
    for (const t of ALL) {
      const c = copyFor(t);
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.body.length).toBeGreaterThan(0);
      expect(c.deepLinkPath.length).toBeGreaterThan(0);
      expect(c.webPath.startsWith("/")).toBe(true);
      expect(c.tag.length).toBeGreaterThan(0);
    }
  });

  it("the data block carries exactly the keys both clients read", () => {
    const d = dataFor("order_paid", "order-123");

    // ⚠ THIS KEY SET GREW IN 059, AND THE PIN IS THE POINT. It caught the growth the moment it
    // happened, which is what a key-set assertion is for. Widening it is a deliberate act with a
    // reason per key, not a repair:
    //   • webPath  — a service worker cannot open `effy://`, and FCM's `fcmOptions.link` does not
    //                work in an iOS home-screen PWA. The web destination has to travel here.
    //   • title/body/tag/group — a WEB message is sent data-only (a `notification` block would make
    //                the Firebase SDK render a second banner on top of ours), so the copy the
    //                service worker displays has nowhere else to ride.
    // Mobile ignores the four new keys and renders FCM's own `notification` block, unchanged.
    expect(Object.keys(d).sort()).toEqual([
      "body",
      "deepLink",
      "entityId",
      "group",
      "tag",
      "title",
      "type",
      "webPath",
    ]);
    expect(d.type).toBe("order_paid");
    expect(d.entityId).toBe("order-123");

    // ⚠ FCM data values must ALL be strings; a number fails the send one field deep in a provider
    // error. Checked for every type, not just this one.
    for (const t of ALL) {
      for (const [k, v] of Object.entries(dataFor(t, "e1"))) {
        expect(typeof v, `${t}.${k}`).toBe("string");
      }
    }
  });

  it("carries no PII in any type's copy (FR-013/FR-031)", () => {
    // The specifics live on the screen the tap opens. Anything that looks like a person, a place or
    // an amount in a push body is a leak onto a lock screen anyone nearby can read.
    const forbidden = [/@/, /\$\d/, /\bstreet\b/i, /\bcustomer\b/i, /\bmr\b/i, /\bms\b/i];
    for (const t of ALL) {
      const c = copyFor(t);
      for (const re of forbidden) {
        expect(c.title, `${t} title`).not.toMatch(re);
        expect(c.body, `${t} body`).not.toMatch(re);
      }
    }
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

  // ── 059 ─────────────────────────────────────────────────────────────────────────────────────
  it("web paths and deep links agree about where a notification leads (P4)", () => {
    // ⚠ 029's pinning, re-applied. That slice shipped a banner whose tap opened the unfiltered
    // store because the web route and the mobile target were decided in two places. The server now
    // derives both from one (type, entityId), and this is what stops them drifting apart again.
    const familyOf = (s: string) => s.replace(/^effy:\/\//, "").split("/")[0] ?? "";
    const webFamilyOf = (s: string) => s.replace(/^\//, "").split("/")[0] ?? "";

    const SAME_DESTINATION: Record<string, string> = {
      order: "orders",
      queue: "orders",
      product: "catalog",
      run: "runs",
    };

    for (const t of ALL) {
      const mobile = familyOf(deepLinkFor(t, "e1"));
      const web = webFamilyOf(webPathFor(t, "e1"));
      expect(SAME_DESTINATION[mobile], `${t}: no mapping for mobile family "${mobile}"`).toBe(web);
    }
  });

  it("an entity-less type yields a bare family path, not a trailing slash (059)", () => {
    expect(webPathFor("shop_awaiting_pick", "")).toBe("/orders");
    expect(webPathFor("shop_new_order", "f1")).toBe("/orders/f1");
    expect(deepLinkFor("shop_awaiting_pick", "")).toBe("effy://queue");
  });

  it("recognises only the types this build knows (the database-boundary guard)", () => {
    // ⚠ The guard that stops one unknown row killing the whole drain. See `copy.ts`.
    for (const t of ALL) expect(isKnownNotificationType(t)).toBe(true);
    expect(isKnownNotificationType("shop_something_a_later_slice_adds")).toBe(false);
    expect(isKnownNotificationType("")).toBe(false);
    // Object prototype keys must not read as known types.
    expect(isKnownNotificationType("toString")).toBe(false);
    expect(isKnownNotificationType("constructor")).toBe(false);
  });
});
