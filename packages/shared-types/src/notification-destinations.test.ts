import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  customerWebPathFor,
  DESTINATION_KINDS,
  parseDestination,
  serializeDestination,
  shopPathFor,
  type CustomerDestination,
  type NotificationAudience,
  type ShopDestination,
} from "./notification-destinations";

const here = dirname(fileURLToPath(import.meta.url));
const apps = resolve(here, "../../../apps");
const SOURCE = resolve(here, "notification-destinations.fixtures.json");
const KOTLIN_COPIES = [
  resolve(apps, "customer-mobile/shared/src/commonTest/kotlin/com/effyshopping/customer/mobile/core/push/DestinationFixture.kt"),
  resolve(apps, "driver-mobile/shared/src/commonTest/kotlin/com/effyshopping/driver/mobile/core/push/DestinationFixture.kt"),
];

interface Case { name: string; audience: NotificationAudience; wire: string; expect: Record<string, string> | null; path?: string; webPath?: string }
const raw = readFileSync(SOURCE, "utf8");
const fixtures = JSON.parse(raw) as { cases: Case[] };

describe("notification destinations - one closed list per audience (109 FR-010, FR-016)", () => {
  it.each(fixtures.cases)("$name", (c) => {
    expect(parseDestination(c.audience, c.wire)).toEqual(c.expect);
  });

  it.each(fixtures.cases.filter((c) => c.path !== undefined))("shop path: $name", (c) => {
    expect(shopPathFor(parseDestination("shop", c.wire) as ShopDestination | null)).toBe(c.path);
  });

  it.each(fixtures.cases.filter((c) => c.audience === "customer"))("customer web path (110): $name", (c) => {
    expect(c.webPath, "every customer case names its website path").toBeDefined();
    expect(customerWebPathFor(parseDestination("customer", c.wire) as CustomerDestination | null)).toBe(c.webPath);
  });

  it("every kind of every audience appears in the fixtures, valid at least once", () => {
    for (const audience of Object.keys(DESTINATION_KINDS) as NotificationAudience[]) {
      for (const kind of DESTINATION_KINDS[audience]) {
        const valid = fixtures.cases.some((c) => c.audience === audience && c.expect?.kind === kind);
        expect(valid, `${audience} ${kind}`).toBe(true);
      }
    }
  });

  it("an already-parsed object is accepted too", () => {
    expect(parseDestination("driver", { kind: "run", runId: "r1" })).toEqual({ kind: "run", runId: "r1" });
    expect(parseDestination("driver", null)).toBeNull();
  });

  it("serialising then parsing gives back the same destination", () => {
    for (const c of fixtures.cases) {
      if (!c.expect) continue;
      const wire = serializeDestination(c.expect as never);
      expect(parseDestination(c.audience, wire)).toEqual(c.expect);
      expect(wire.startsWith('{"kind":')).toBe(true);
    }
  });

  // Each app embeds the file because commonTest cannot read outside the app. A copy that drifts is the defect.
  it.each(KOTLIN_COPIES.filter((p) => existsSync(p)))("the Kotlin copy is the fixtures file: %s", (path) => {
    const kt = readFileSync(path, "utf8");
    const embedded = /"""\n([\s\S]*?)\n"""/.exec(kt)?.[1];
    expect(embedded, "no triple-quoted copy found").toBeDefined();
    expect(JSON.parse(embedded!)).toEqual(JSON.parse(raw));
  });

  it("both Kotlin copies exist", () => {
    for (const p of KOTLIN_COPIES) expect(existsSync(p), p).toBe(true);
  });
});
