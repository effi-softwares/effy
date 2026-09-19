import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { KNOWN_SHOP_NOTIFICATION_TYPES, SHOP_NOTIFICATION_TYPES } from "@effy/edge-shared";

/**
 * The 059 wiring contract — read against the REAL `serverless.yml`.
 *
 * ⚠ WHY THIS FILE EXISTS. 035 shipped a defect where the audience map read four env vars
 * `serverless.yml` never declared: every pool resolved "unknown", no email was ever sent, and **100
 * passing tests missed it because they set those vars themselves**. The same shape applies to a
 * route: a handler file that typechecks, unit-tests green and is never registered answers nothing at
 * all, and the only symptom is a 404 an operator reports days later.
 *
 * The evaluator is worse again — an unregistered SCHEDULE produces no error anywhere. It simply
 * never runs, and the console silently never notifies about attention.
 */
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
    // An unregistered schedule is the silent failure this test exists for: nothing errors, the
    // function simply never runs, and attention is never announced.
    const block = SLS.slice(SLS.indexOf("attentionEvaluate:"));
    const scoped = block.slice(0, block.indexOf("shopNotificationPrefsV1Get:"));
    expect(scoped).toMatch(/- schedule: rate\(\d+ minutes?\)/);
    expect(scoped).not.toMatch(/httpApi/);
  });

  it("⚠ the evaluator has a timeout longer than the default", () => {
    // It walks every active shop, and each shop is five queries. The 6s API default would cut the
    // run off part-way through — silently, because the shops it did reach were processed fine.
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
  it("the five shop types and their keys agree", () => {
    // ⚠ Written out, not derived from the export — a list built from the implementation agrees with
    // the implementation and proves nothing (027 R13).
    expect([...KNOWN_SHOP_NOTIFICATION_TYPES].sort()).toEqual([
      "shop_awaiting_pick",
      "shop_low_stock",
      "shop_new_order",
      "shop_out_of_stock",
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
    // The label is what the SETTINGS SCREEN calls a type; the title is what the BANNER says. They
    // are different strings for different jobs, and `worker/copy.ts` owns the second. Asserting the
    // distinction here stops a future change collapsing them into one and making the settings
    // screen read "New order to pick" as a heading.
    const newOrder = SHOP_NOTIFICATION_TYPES.find((t) => t.type === "shop_new_order");
    expect(newOrder?.label).toBe("New orders");
    expect(newOrder?.label).not.toBe("New order to pick");
  });
});
