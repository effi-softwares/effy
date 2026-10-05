import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 071 — NO ROUTE MAY CHANGE WHAT A LIVE SCREEN SHOWS WITHOUT SAYING SO.
 *
 * Since 071 no screen re-reads on a timer. A new route that changes an order, a round or a stock
 * count and does not announce it produces a screen that is simply wrong until someone refreshes —
 * no error, no log line, no failing test. This is the test that fails instead.
 *
 * Every state-changing function (`-post|-put|-patch|-delete`) and every scheduled function in the
 * services below must either REACH an announcing call, or be listed in `SILENT` with the reason it
 * changes nothing a live screen shows (specs/071-live-updates/contracts/change-map.md).
 *
 * ⚠ "REACHES" IS BY IMPORT, NOT BY EXECUTION PATH: the function's file, or a file it imports
 * (transitively, within its service), calls an announcing function. That is deliberately generous —
 * it cannot prove the right audience is told, only catch the route that tells nobody. The audience
 * is proved by the tests beside each announcing function.
 */
const here = dirname(fileURLToPath(import.meta.url));
const edgeApi = resolve(here, "../../..");

const SERVICES = ["commerce", "shop", "inventory", "driver", "fleet", "orders", "catalog", "admin"] as const;

/**
 * Calls that announce — directly, or from inside the shared money module under this service's role.
 *
 * ⚠ `commerce` wires its services in one module (`lib/wiring.ts`), which every one of its functions
 * imports. Following imports THROUGH it would make every cart route "reach" the refund service and
 * the check vacuous for the whole service — which is what this guard's first run did. So a wiring
 * hub is not followed; a function must itself call one of the hub's announcing entry points.
 */
const ANNOUNCES = /\b(announce\w*|createRefundService|refundService\.\w+|handleWebhook|checkoutService\.confirm\w*)\(/;
const WIRING_HUB = /\/lib\/wiring\.ts$/;

/** `service/function-file` → why it tells nobody. A reason is required; "n/a" is not one. */
const SILENT: Record<string, string> = {
  // ── commerce: the shopper's own cart, lists and saved items — kept in step across their devices
  //    by the cart's own mechanism (027), and shown on no staff screen (spec Assumptions).
  "commerce/cart-item-set-aside-v1-post": "cart — own sync mechanism (027)",
  "commerce/cart-item-v1-delete": "cart — own sync mechanism (027)",
  "commerce/cart-item-v1-patch": "cart — own sync mechanism (027)",
  "commerce/cart-items-v1-post": "cart — own sync mechanism (027)",
  "commerce/cart-merge-v1-post": "cart — own sync mechanism (027)",
  "commerce/cart-preview-v1-post": "a price preview; writes nothing",
  "commerce/cart-promo-v1-delete": "cart — own sync mechanism (027)",
  "commerce/cart-promo-v1-post": "cart — own sync mechanism (027)",
  "commerce/cart-reorder-v1-post": "cart — own sync mechanism (027)",
  "commerce/cart-saved-restore-v1-post": "cart — own sync mechanism (027)",
  "commerce/cart-saved-v1-delete": "cart — own sync mechanism (027)",
  "commerce/cart-v1-delete": "cart — own sync mechanism (027)",
  "commerce/checkout-quote-v1-post": "a delivery quote; writes nothing a screen shows",
  "commerce/checkout-intent-v1-post": "creates an UNPAID order, which no shop, driver or back-office screen lists; the slot hold it takes is confirmed (and announced) at payment",
  "commerce/list-add-to-cart-v1-post": "the shopper's own lists (068)",
  "commerce/list-entry-v1-delete": "the shopper's own lists (068)",
  "commerce/list-entry-v1-put": "the shopper's own lists (068)",
  "commerce/list-v1-delete": "the shopper's own lists (068)",
  "commerce/list-v1-patch": "the shopper's own lists (068)",
  "commerce/lists-v1-post": "the shopper's own lists (068)",
  "commerce/payment-method-v1-delete": "the shopper's own saved cards",
  "commerce/saved-add-to-cart-v1-post": "the shopper's own saved items (033)",
  "commerce/saved-item-v1-delete": "the shopper's own saved items (033)",
  "commerce/saved-item-v1-put": "the shopper's own saved items (033)",
  "commerce/saved-merge-v1-post": "the shopper's own saved items (033)",

  // ── shop: catalogue authoring, notes and tags, devices, team.
  "shop/order-notes-v1-post": "an internal note on one order — shown on the order's own page to whoever opens it, not on a list",
  "shop/order-tags-v1-put": "internal tags on one order — as notes",
  "shop/product-create-v1-post": "catalogue authoring: a draft is the author's own until submitted, and submission announces `review`",
  "shop/product-delete-v1-delete": "catalogue authoring (shopper-facing catalogue is out of scope — spec Assumptions)",
  "shop/product-media-create-v1-post": "catalogue authoring",
  "shop/product-media-delete-v1-delete": "catalogue authoring",
  "shop/product-media-patch-v1-patch": "catalogue authoring",
  "shop/product-media-register-v1-post": "catalogue authoring",
  "shop/product-sections-v1-patch": "catalogue authoring",
  "shop/product-status-v1-post": "catalogue authoring",
  "shop/product-update-v1-patch": "catalogue authoring: a change to a live product becomes a pending change only on submit, which announces `review`",
  "shop/sections-create-v1-post": "catalogue authoring",
  "shop/sections-delete-v1-delete": "catalogue authoring",
  "shop/sections-update-v1-patch": "catalogue authoring",
  "shop/shop-devices-v1-id-delete": "push device registration — the other channel",
  "shop/shop-devices-v1-post": "push device registration — the other channel",
  "shop/shop-notification-prefs-v1-patch": "the operator's own notification preferences",
  "shop/team-deactivate-v1-post": "team administration; a deactivated operator's own channel closes at the next epoch (research R5), which needs no announcement",
  "shop/team-invite-v1-post": "team administration",
  "shop/team-role-v1-patch": "team administration",

  "shop/insights-reconcile": "rebuilds the prepared analytics rollup; Insights is not a live screen (FR-030)",

  // ── driver
  "driver/driver-activity-read-v1-post": "marks the driver's own activity feed read",
  "driver/driver-devices-v1-id-delete": "push device registration — the other channel",
  "driver/driver-devices-v1-post": "push device registration — the other channel",
  "driver/driver-drop-proof-presign-v1-post": "issues an upload URL; changes nothing until the proof is submitted",

  // ── fleet
  "fleet/vehicle-create-v1-post": "vehicle register — no screen in FR-029",
  "fleet/vehicle-holding-issue-v1-post": "vehicle register — no screen in FR-029",
  "fleet/vehicle-holding-return-v1-post": "vehicle register — no screen in FR-029",
  "fleet/vehicle-status-v1-post": "vehicle register — no screen in FR-029",
  "fleet/vehicle-update-v1-patch": "vehicle register — no screen in FR-029",

  // ── catalog
  "catalog/review-queue-age-scheduled": "emits a metric about the queue's age; changes nothing",
};

/** Every admin function is configuration or administration, none of it on a screen in FR-029. */
const SILENT_SERVICES: Record<string, string> = {
  admin:
    "back-office administration and configuration — catalogue taxonomy, delivery zones and plans, promotions, shops and their users, feedback, order policy. FR-029 lists orders, dispatch and drivers, slot load and the review queue; none of those is written here (they are written by `orders`, `fleet` and `catalog`).",
};

function reaches(file: string, seen = new Set<string>()): boolean {
  if (seen.has(file)) return false;
  seen.add(file);
  const source = readFileSync(file, "utf8");
  if (ANNOUNCES.test(source)) return true;
  for (const m of source.matchAll(/from\s+"(\.{1,2}\/[^"]+)"/g)) {
    const base = resolve(dirname(file), m[1]!);
    const next = [`${base}.ts`, resolve(base, "index.ts")].find(existsSync);
    if (next && !WIRING_HUB.test(next) && reaches(next, seen)) return true;
  }
  return false;
}

const functions = SERVICES.flatMap((service) =>
  readdirSync(resolve(edgeApi, service, "src/functions"))
    .filter((f) => /(-(post|put|patch|delete)|-scheduled|^attention-evaluate|^insights-reconcile)\.ts$/.test(f))
    .map((f) => ({ service, name: f.replace(/\.ts$/, ""), file: resolve(edgeApi, service, "src/functions", f) })),
);

describe("071 — every change a live screen shows is announced", () => {
  it("is looking at the routes (the enumeration found them)", () => {
    expect(functions.length).toBeGreaterThan(120);
    expect(functions.map((f) => `${f.service}/${f.name}`)).toContain("commerce/stripe-webhook-v1-post");
  });

  const mustAnnounce = functions.filter((f) => !(f.service in SILENT_SERVICES) && !(`${f.service}/${f.name}` in SILENT));

  it.each(mustAnnounce.map((f) => [`${f.service}/${f.name}`, f] as const))("%s announces", (_id, f) => {
    expect(reaches(f.file), "it changes state and tells no screen — announce it, or add it to SILENT with the reason").toBe(true);
  });

  it("every exemption names a function that exists and gives a reason", () => {
    const known = new Set(functions.map((f) => `${f.service}/${f.name}`));
    for (const [id, reason] of Object.entries(SILENT)) {
      expect(known.has(id), `${id} is exempted but does not exist — remove it`).toBe(true);
      expect(reason.length).toBeGreaterThan(15);
    }
  });

  // There is deliberately no check that an exempted function does NOT reach an announcing call.
  // Reach is by import: `shop/order-notes` imports the order service, where `setPicks` announces,
  // and that says nothing about notes. Such a check fails on exactly the exemptions that are right.

  it("no admin function writes an order, a round, a slot or a review decision", () => {
    // The whole-service exemption rests on this. If it stops being true, exempt per function.
    const offenders = functions
      .filter((f) => f.service === "admin")
      .filter((f) => /^(order-(?!policy)|dispatch-|delivery-slot|review-|fulfillment-|refund-|driver-)/.test(f.name))
      .map((f) => f.name);
    expect(offenders).toEqual([]);
  });
});
