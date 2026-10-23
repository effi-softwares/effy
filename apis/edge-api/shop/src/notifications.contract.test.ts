import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { KNOWN_SHOP_NOTIFICATION_TYPES, SHOP_NOTIFICATION_TYPES } from "@effy/edge-shared";

/** Reads the real serverless.yml: an unregistered route or schedule fails silently. */
const ROOT = join(import.meta.dirname, "..");
const SLS = readFileSync(join(ROOT, "serverless.yml"), "utf8");

describe("⚠ every 059 handler is actually registered", () => {
  it.each([
    ["src/functions/attention-evaluate.handler", "the attention evaluator"],
    ["src/functions/shop-notification-prefs-v1-get.handler", "the preferences read"],
    ["src/functions/shop-notification-prefs-v1-patch.handler", "the preferences write"],
  ])("%s — %s", (handler) => {
    expect(SLS).toContain(handler);
  });

  it("the preference routes sit behind the SHOP authorizer, like every other shop route", () => {
    const block = SLS.slice(SLS.indexOf("shopNotificationPrefsV1Get:"));
    const scoped = block.slice(0, block.indexOf("shopNotificationPrefsV1Patch:"));
    expect(scoped).toMatch(/authorizer\/shop_id/);
    expect(scoped).toMatch(/path: \/shop\/v1\/notification-preferences/);
  });

  it("⚠ the evaluator is on a SCHEDULE, not an HTTP route", () => {
    // An unregistered schedule never runs and nothing errors.
    const block = SLS.slice(SLS.indexOf("attentionEvaluate:"));
    const scoped = block.slice(0, block.indexOf("shopNotificationPrefsV1Get:"));
    expect(scoped).toMatch(/- schedule: rate\(\d+ minutes?\)/);
    expect(scoped).not.toMatch(/httpApi/);
  });

  it("⚠ the evaluator has a timeout longer than the default", () => {
    // Every active shop at five queries each: the 6 s default would cut the run off part-way.
    const block = SLS.slice(SLS.indexOf("attentionEvaluate:"));
    const scoped = block.slice(0, block.indexOf("shopNotificationPrefsV1Get:"));
    expect(scoped).toMatch(/timeout: \d+/);
  });

  it("every declared handler file exists", () => {
    const declared = [...SLS.matchAll(/handler: (src\/functions\/[\w.-]+)\.handler/g)].map(
      (m) => m[1]!,
    );
    const present = new Set(
      readdirSync(join(ROOT, "src", "functions"))
        .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
        .map((f) => `src/functions/${f.replace(/\.ts$/, "")}`),
    );
    expect(declared.length).toBeGreaterThan(40);
    for (const d of declared) expect(present.has(d), `${d} is declared but missing`).toBe(true);
  });
});

describe("⚠ the notification type catalogue has one source", () => {
  it("the seven shop types and their keys agree", () => {
    // Written out, not derived from the export.
    expect([...KNOWN_SHOP_NOTIFICATION_TYPES].sort()).toEqual([
      "shop_awaiting_pick",
      "shop_low_stock",
      "shop_new_order",
      "shop_out_of_stock",
      "shop_product_approved",
      "shop_product_sent_back",
      "shop_refund_proposed",
    ]);
  });

  it("every type has a label and a group, and only the refund is role-scoped", () => {
    for (const t of SHOP_NOTIFICATION_TYPES) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(["orders", "attention"]).toContain(t.group);
    }
    const scoped = SHOP_NOTIFICATION_TYPES.filter((t) => t.requiresRole);
    expect(scoped.map((t) => t.type)).toEqual(["shop_refund_proposed"]);
  });

  it("⚠ a label is not a notification title", () => {
    // The settings label and the banner title are different strings for different jobs (`worker/copy.ts` owns titles).
    const newOrder = SHOP_NOTIFICATION_TYPES.find((t) => t.type === "shop_new_order");
    expect(newOrder?.label).toBe("New orders");
    expect(newOrder?.label).not.toBe("New order to pick");
  });
});
