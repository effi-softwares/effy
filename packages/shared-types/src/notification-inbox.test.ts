import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { groupInboxByDay, INBOX_CATEGORIES, inboxCategoriesFor, inboxTimeLabel, isInboxCategory, type InboxCategory } from "./notification-inbox";

const here = dirname(fileURLToPath(import.meta.url));
const apps = resolve(here, "../../../apps");
const SOURCE = resolve(here, "notification-inbox.fixtures.json");
const KOTLIN_COPIES = [
  resolve(apps, "customer-mobile/shared/src/commonTest/kotlin/com/effyshopping/customer/mobile/features/notifications/InboxCategoryFixture.kt"),
  resolve(apps, "driver-mobile/shared/src/commonTest/kotlin/com/effyshopping/driver/mobile/features/inbox/InboxCategoryFixture.kt"),
];

interface Row { key: string; label: string; icon: string; filterableBy: string[] }
const raw = readFileSync(SOURCE, "utf8");
const fixtures = JSON.parse(raw) as { categories: Row[] };

describe("inbox categories (110 R13)", () => {
  it("INBOX_CATEGORIES is the fixtures file, in order", () => {
    expect(fixtures.categories.map((r) => r.key)).toEqual(Object.keys(INBOX_CATEGORIES));
    for (const r of fixtures.categories) {
      const info = INBOX_CATEGORIES[r.key as InboxCategory];
      expect({ label: info.label, icon: info.icon, filterableBy: [...info.filterableBy] }).toEqual({
        label: r.label,
        icon: r.icon,
        filterableBy: r.filterableBy,
      });
    }
  });

  it("each audience filters by what the spec names (FR-007)", () => {
    expect(inboxCategoriesFor("customer")).toEqual(["orders", "points", "offers", "news", "important", "support"]);
    expect(inboxCategoriesFor("shop")).toEqual(["orders", "stock", "products", "important", "announcements"]);
    expect(inboxCategoriesFor("driver")).toEqual([]);
  });

  it("recognises categories and nothing else", () => {
    expect(isInboxCategory("orders")).toBe(true);
    expect(isInboxCategory("toString")).toBe(false);
    expect(isInboxCategory(7)).toBe(false);
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

describe("inbox days on Effy's clock (110 R21)", () => {
  const tz = "Australia/Melbourne";
  const now = new Date("2026-11-08T23:00:00Z"); // 10 am on the 9th in Melbourne

  it("groups by Effy's day, not UTC's", () => {
    const groups = groupInboxByDay(
      [
        { id: "today-early", createdAt: "2026-11-08T13:30:00.000000Z" },
        { id: "yesterday", createdAt: "2026-11-08T12:59:00.000000Z" },
        { id: "earlier", createdAt: "2026-11-06T01:00:00.000000Z" },
      ],
      now,
      tz,
    );
    expect(groups.map((g) => [g.heading, g.items.map((i) => i.id)])).toEqual([
      ["Today", ["today-early"]],
      ["Yesterday", ["yesterday"]],
      ["Earlier", ["earlier"]],
    ]);
  });

  it("says the time for today and yesterday, and the date before", () => {
    expect(inboxTimeLabel("2026-11-08T13:30:00.000000Z", now, tz)).toBe("12:30 am");
    expect(inboxTimeLabel("2026-11-06T01:00:00.000000Z", now, tz)).toBe("Fri 6 Nov");
  });
});
