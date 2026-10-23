import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * No route may change what a live screen shows without saying so. Every state-changing and scheduled
 * function must reach an announcing call (by import, transitively within its service) or be listed in
 * `SILENT` with its reason. It cannot prove the right audience is told; the tests beside each
 * announcing function do that.
 */
const here = dirname(fileURLToPath(import.meta.url));
const edgeApi = resolve(here, "../../..");

const SERVICES = ["commerce", "shop", "inventory", "driver", "fleet", "orders", "catalog", "admin"] as const;

/**
 * Calls that announce. `commerce`'s `lib/wiring.ts` is imported by every function, so it is not
 * followed: a function must call one of its announcing entry points itself.
 */
const ANNOUNCES = /\b(announce\w*|createRefundService|refundService\.\w+|handleWebhook|checkoutService\.confirm\w*)\(/;
const WIRING_HUB = /\/lib\/wiring\.ts$/;

/** `service/function-file` → why it tells nobody. A reason is required; "n/a" is not one. */
const SILENT: Record<string, string> = {
  // commerce: the shopper's own cart, lists and saved items, synced by the cart's own mechanism.
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

  // shop: catalogue authoring, notes and tags, devices, team.
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
  "commerce/order-business-identity-v1-put": "096 — the buyer's business details for a tax invoice not yet issued; no screen shows them live",
  "orders/admin-tax-settings-v1-put": "096 — Effy's tax identity and the invoice switch; read when a document is asked for, shown live nowhere",
  "catalog/gst-bulk-v1-post": "096 — a product's GST status; no live screen shows it (the GST missing list re-reads on its own mutation)",
  "fleet/shop-pack-scanning-v1-put": "096 — a shop rule read only when the shop next marks an order ready; no screen shows it live, so nothing is announced",
  "shop/team-deactivate-v1-post": "team administration; a deactivated operator's own channel closes at the next epoch (research R5), which needs no announcement",
  "shop/team-invite-v1-post": "team administration",
  "shop/team-role-v1-patch": "team administration",

  "shop/insights-reconcile": "rebuilds the prepared analytics rollup; Insights is not a live screen (FR-030)",

  // driver
  "driver/driver-devices-v1-id-delete": "push device registration — the other channel",
  "driver/driver-devices-v1-post": "push device registration — the other channel",
  "driver/driver-drop-proof-presign-v1-post": "issues an upload URL; changes nothing until the proof is submitted",

  // fleet
  "fleet/vehicle-create-v1-post": "vehicle register — no screen in FR-029",
  "fleet/vehicle-holding-issue-v1-post": "vehicle register — no screen in FR-029",
  "fleet/vehicle-holding-return-v1-post": "vehicle register — no screen in FR-029",
  "fleet/vehicle-status-v1-post": "vehicle register — no screen in FR-029",
  "fleet/vehicle-update-v1-patch": "vehicle register — no screen in FR-029",

  // catalog
  "catalog/review-queue-age-scheduled": "emits a metric about the queue's age; changes nothing",
};

/** Every admin function is configuration or administration. */
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

  // No check that an exempt function does not reach an announcer: reach is by import and says nothing about the exempt route.

  it("no admin function writes an order, a round, a slot or a review decision", () => {
    // The whole-service exemption rests on this.
    const offenders = functions
      .filter((f) => f.service === "admin")
      .filter((f) => /^(order-(?!policy)|dispatch-|delivery-slot|review-|fulfillment-|refund-|driver-)/.test(f.name))
      .map((f) => f.name);
    expect(offenders).toEqual([]);
  });
});
