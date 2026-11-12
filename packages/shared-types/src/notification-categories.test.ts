import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ANDROID_CHANNELS, categoriesFor, findPolicy, MARKETING_CATEGORIES, NOTIFICATION_CATEGORY_POLICY, policyFor } from "./notification-categories";

const here = dirname(fileURLToPath(import.meta.url));
const apps = resolve(here, "../../../apps");
const migrations = resolve(here, "../../../db/migrations");
const SOURCE = resolve(here, "notification-categories.fixtures.json");
const KOTLIN_COPIES = [
  resolve(apps, "customer-mobile/shared/src/commonTest/kotlin/com/effyshopping/customer/mobile/core/push/NotificationCategoryFixture.kt"),
  resolve(apps, "driver-mobile/shared/src/commonTest/kotlin/com/effyshopping/driver/mobile/core/push/NotificationCategoryFixture.kt"),
];
const raw = readFileSync(SOURCE, "utf8");
const fixtures = JSON.parse(raw) as { policies: unknown[]; androidChannels: unknown };

/** The CHECK list a migration's Up section gives one constraint (the newest migration that defines it). */
function checkList(constraint: string): string[] {
  const files = readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort().reverse();
  for (const file of files) {
    const up = readFileSync(resolve(migrations, file), "utf8").split(/--\s*\+goose Down/)[0] ?? "";
    const m = new RegExp(`CONSTRAINT\\s+${constraint}\\s+CHECK\\s*\\([^\\[]*ARRAY\\[([^\\]]*)\\]`).exec(up);
    if (m) return [...m[1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!);
  }
  throw new Error(`no migration defines ${constraint}`);
}

describe("notification categories (111 FR-001, FR-002)", () => {
  it("the policy is the fixtures file, in order", () => {
    expect(JSON.parse(JSON.stringify(NOTIFICATION_CATEGORY_POLICY))).toEqual(fixtures.policies);
    expect(JSON.parse(JSON.stringify(ANDROID_CHANNELS))).toEqual(fixtures.androidChannels);
  });

  it("each audience has exactly the spec's categories", () => {
    expect(categoriesFor("customer").map((p) => p.category)).toEqual(["orders", "points", "offers", "news", "important", "support"]);
    expect(categoriesFor("driver").map((p) => p.category)).toEqual(["work", "announcements", "important"]);
    expect(categoriesFor("shop").map((p) => p.category)).toEqual(["orders", "stock", "products", "announcements", "important"]);
  });

  it("a required category has a reason and nothing to change; a changeable one has no reason", () => {
    for (const p of NOTIFICATION_CATEGORY_POLICY) {
      if (p.required) {
        expect(p.changeable, `${p.audience}:${p.category}`).toEqual([]);
        expect(p.reason, `${p.audience}:${p.category}`).toBeTruthy();
      } else {
        expect(p.changeable.length, `${p.audience}:${p.category}`).toBeGreaterThan(0);
        expect(p.reason).toBeNull();
      }
    }
  });

  it("only the customer's offers and news are marketing; email for them is a switch the customer turns on (115)", () => {
    expect(NOTIFICATION_CATEGORY_POLICY.filter((p) => p.marketing).map((p) => `${p.audience}:${p.category}`)).toEqual(["customer:offers", "customer:news"]);
    expect(MARKETING_CATEGORIES).toEqual(["offers", "news"]);
    for (const c of MARKETING_CATEGORIES) {
      expect(policyFor("customer", c).changeable).toEqual(["push", "email"]);
      // Off until the customer turns it on: a yes to offers is not a yes to email.
      expect(policyFor("customer", c).defaults.email).toBe(false);
    }
  });

  it("every driver and shop category is required (FR-003)", () => {
    for (const p of [...categoriesFor("driver"), ...categoriesFor("shop")]) expect(p.required).toBe(true);
  });

  it("every customer and driver category is filed in a channel its app creates; shop has none", () => {
    for (const aud of ["customer", "driver"] as const) {
      const ids = ANDROID_CHANNELS[aud].map((c) => c.id);
      for (const p of categoriesFor(aud)) expect(ids, `${aud}:${p.category}`).toContain(p.androidChannel);
    }
    for (const p of categoriesFor("shop")) expect(p.androidChannel).toBeNull();
  });

  it("the database allows a choice row for exactly the changeable categories and channels", () => {
    const changeable = categoriesFor("customer").filter((p) => p.changeable.length > 0);
    expect(checkList("customer_notification_choice_category_check").sort()).toEqual(changeable.map((p) => p.category).sort());
    expect(checkList("customer_marketing_consent_category_check").sort()).toEqual([...MARKETING_CATEGORIES].sort());
    expect(checkList("customer_notification_choice_channel_check").sort()).toEqual(["email", "push"]);
  });

  it("an unknown pair is null, or an error when it must exist", () => {
    expect(findPolicy("driver", "offers")).toBeNull();
    expect(() => policyFor("shop", "points")).toThrow();
  });

  it.each(KOTLIN_COPIES.filter((p) => existsSync(p)))("the Kotlin copy is the fixtures file: %s", (path) => {
    const embedded = /"""\n([\s\S]*?)\n"""/.exec(readFileSync(path, "utf8"))?.[1];
    expect(embedded, "no triple-quoted copy found").toBeDefined();
    expect(JSON.parse(embedded!)).toEqual(JSON.parse(raw));
  });

  it("both Kotlin copies exist", () => {
    for (const p of KOTLIN_COPIES) expect(existsSync(p), p).toBe(true);
  });
});

describe("116 FR-021 - Android's urgency stays 111's", () => {
  it("important is a high-importance channel; offers and news a default one (both apps pin these channels)", () => {
    const ch = (audience: "customer" | "driver", id: string) =>
      (fixtures.androidChannels as Record<string, { id: string; importance: string }[]>)[audience]!.find((c) => c.id === id)!.importance;
    expect(ch("customer", "important")).toBe("high");
    expect(ch("driver", "important")).toBe("high");
    expect(ch("customer", "offers_news")).toBe("default");
  });
});

