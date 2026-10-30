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

// The FCM `data` block is what the apps' deep-link handlers parse. The type list is written out, not
// imported, so adding a type without adding it here fails the exhaustiveness check.
const ALL: NotificationType[] = [
  "order_paid",
  "order_ready",
  "order_out_for_delivery",
  "order_delivered",
  "shop_new_order",
  "run_assigned",
  "shop_awaiting_pick",
  "shop_out_of_stock",
  "shop_low_stock",
  "shop_refund_proposed",
  "shop_product_approved",
  "shop_product_sent_back",
  "shop_product_held",
  "shop_product_released",
  "shop_product_added_by_effy",
  "shop_products_imported",
  "points_credited",
  "points_expiring",
  "order_with_courier",
  "order_delivery_changed",
  "run_changed",
  "run_withdrawn",
  "run_opens_soon",
];

describe("notification copy + wire contract", () => {
  it("the catalogue is exhaustive - no type ships without copy, and none is left untested", () => {
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

    // The key set is pinned. webPath: a service worker cannot open `effy://`. title/body/tag/group: web
    // messages are data-only, so the copy rides here. Mobile ignores these four.
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

    // FCM data values must all be strings.
    for (const t of ALL) {
      for (const [k, v] of Object.entries(dataFor(t, "e1"))) {
        expect(typeof v, `${t}.${k}`).toBe("string");
      }
    }
  });

  it("carries no PII in any type's copy (FR-013/FR-031)", () => {
    // No person, place or amount in a push body: lock screens are public.
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
    expect(deepLinkFor("order_paid", "o1")).toBe("effy://order/o1");
    expect(deepLinkFor("order_ready", "o1")).toBe("effy://order/o1");
    expect(deepLinkFor("order_out_for_delivery", "o1")).toBe("effy://order/o1");
    expect(deepLinkFor("order_delivered", "o1")).toBe("effy://order/o1");
    expect(deepLinkFor("shop_new_order", "f1")).toBe("effy://queue/f1");
    expect(deepLinkFor("run_assigned", "r1")).toBe("effy://run/r1");
    expect(deepLinkFor("run_changed", "r1")).toBe("effy://run/r1");
    expect(deepLinkFor("run_withdrawn", "r1")).toBe("effy://run/r1");
    expect(deepLinkFor("run_opens_soon", "r1")).toBe("effy://run/r1");
  });

  it("web paths and deep links agree about where a notification leads (P4)", () => {
    // Web route and mobile target are derived from one (type, entityId) and must agree.
    const familyOf = (s: string) => s.replace(/^effy:\/\//, "").split("/")[0] ?? "";
    const webFamilyOf = (s: string) => s.replace(/^\//, "").split("/")[0] ?? "";

    const SAME_DESTINATION: Record<string, string> = {
      order: "orders",
      queue: "orders",
      product: "catalog",
      run: "runs",
      points: "account?tab=points",
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

  // The payload carries the product id, so the tap lands on the product.
  it("a review decision opens the product it is about, on both surfaces (067)", () => {
    for (const t of ["shop_product_approved", "shop_product_sent_back", "shop_product_held", "shop_product_released", "shop_product_added_by_effy"] as const) {
      expect(webPathFor(t, "p1")).toBe("/catalog/p1");
      expect(deepLinkFor(t, "p1")).toBe("effy://product/p1");
    }
  });

  // A send-back reason is read in the console, never on a lock screen.
  it("never puts a product name, a price or the send-back reason in the push text (067)", () => {
    for (const t of ["shop_product_approved", "shop_product_sent_back", "shop_product_held", "shop_product_released"] as const) {
      const c = copyFor(t);
      expect(`${c.title} ${c.body}`).not.toMatch(/\$|\d|because|reason:/i);
    }
  });

  it("recognises only the types this build knows (the database-boundary guard)", () => {
    // One unknown row must not kill the whole drain.
    for (const t of ALL) expect(isKnownNotificationType(t)).toBe(true);
    expect(isKnownNotificationType("shop_something_a_later_slice_adds")).toBe(false);
    expect(isKnownNotificationType("")).toBe(false);
    // Object prototype keys must not read as known types.
    expect(isKnownNotificationType("toString")).toBe(false);
    expect(isKnownNotificationType("constructor")).toBe(false);
  });

  it("074 - a points notification opens the points screen, never a per-entry path that does not exist", () => {
    for (const t of ["points_credited", "points_expiring"] as const) {
      expect(deepLinkFor(t, "entry-1")).toBe("effy://points");
      expect(webPathFor(t, "entry-1")).toBe("/account?tab=points");
    }
    // The entity is a consignment; the tap opens the orders.
    expect(deepLinkFor("order_with_courier", "consignment-1")).toBe("effy://order");
    expect(webPathFor("order_with_courier", "consignment-1")).toBe("/orders");
    // The entity is a move; the tap opens the orders.
    expect(deepLinkFor("order_delivery_changed", "move-1")).toBe("effy://order");
    expect(webPathFor("order_delivery_changed", "move-1")).toBe("/orders");
    expect(deepLinkFor("order_paid", "o-1")).toBe("effy://order/o-1");
  });
});
