import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import fixtures from "./web-links.fixtures.json";
import {
  APP_LINK_PATHS,
  customerWebPathFor,
  interruptionLevelFor,
  isAppleTeamId,
  parseWebLink,
  type CustomerDestination,
} from "./notification-destinations";

/** 116 - Effy links (B7) and iPhone urgency (D7): one parser, pinned here and in the customer app. */
describe("116 - Effy links", () => {
  it.each(fixtures.links)("$path", ({ path, destination, messageId }) => {
    expect(parseWebLink(path)).toEqual({ destination, messageId });
  });

  it.each(fixtures.roundTrip as CustomerDestination[])("round trip %o", (d) => {
    expect(parseWebLink(customerWebPathFor(d)).destination).toEqual(d);
  });

  it("a product's aisle is not on the path, so the link opens the product alone", () => {
    expect(parseWebLink(customerWebPathFor({ kind: "product", productId: "p1", aisleKey: "dairy" })).destination).toEqual({ kind: "product", productId: "p1" });
  });

  it("every claimed path parses to a page, and every page's path is claimed", () => {
    const claimed = (path: string) => APP_LINK_PATHS.some((p) => (p.prefix ? path.startsWith(p.path) : path === p.path));
    for (const d of fixtures.roundTrip as CustomerDestination[]) expect(claimed(customerWebPathFor(d).split("?")[0]!)).toBe(true);
    for (const l of fixtures.links) {
      const bare = l.path.split("?")[0]!;
      if (l.destination === null && !bare.startsWith("/orders/") && !bare.startsWith("/product/")) expect(claimed(bare), bare).toBe(false);
    }
  });
});

describe("116 - interruption levels", () => {
  it("important → time-sensitive only when switched on; importance wins over category", () => {
    expect(interruptionLevelFor("important", "orders", true)).toBe("time-sensitive");
    expect(interruptionLevelFor("important", "offers", true)).toBe("time-sensitive");
    expect(interruptionLevelFor("important", "important", false)).toBe("active");
  });

  it("offers and news are quiet; everything else is ordinary; never critical", () => {
    expect(interruptionLevelFor("normal", "offers", true)).toBe("passive");
    expect(interruptionLevelFor("normal", "news", false)).toBe("passive");
    for (const c of ["orders", "points", "support", "announcements", "runs"]) {
      for (const on of [true, false]) expect(["active", "passive", "time-sensitive"]).toContain(interruptionLevelFor("normal", c, on));
    }
    expect(interruptionLevelFor("normal", "orders", true)).toBe("active");
  });

  it("only a real team id switches time-sensitive on", () => {
    expect(isAppleTeamId("AB12CD34EF")).toBe(true);
    for (const v of ["off", "", "-", "ab12cd34ef", "AB12CD34E", undefined, null]) expect(isAppleTeamId(v as string)).toBe(false);
  });
});

describe("116 - the customer app claims exactly APP_LINK_PATHS", () => {
  it("the Android manifest's link filter lists the same paths, verified, on the configured host", () => {
    const manifest = readFileSync(resolve(__dirname, "../../../apps/customer-mobile/androidApp/src/main/AndroidManifest.xml"), "utf8");
    const filter = /<intent-filter android:autoVerify="true">([\s\S]*?)<\/intent-filter>/.exec(manifest)?.[1] ?? "";
    expect(filter).toContain('android:host="${effyLinkHost}"');
    expect(filter).toContain('android:scheme="https"');
    const claimed = [...filter.matchAll(/android:(path|pathPrefix)="([^"]+)"/g)].map((m) => ({ path: m[2], prefix: m[1] === "pathPrefix" }));
    expect(claimed).toEqual(APP_LINK_PATHS.map((p) => ({ path: p.path, prefix: p.prefix })));
  });
});

describe("116 - the customer app's copy of the fixtures", () => {
  it("is the fixtures file, unchanged", () => {
    const path = resolve(__dirname, "../../../apps/customer-mobile/shared/src/commonTest/kotlin/com/effyshopping/customer/mobile/core/push/WebLinkFixture.kt");
    const embedded = /"""\n([\s\S]*?)\n"""/.exec(readFileSync(path, "utf8"))?.[1];
    expect(embedded, "no triple-quoted copy found").toBeDefined();
    expect(JSON.parse(embedded!)).toEqual(JSON.parse(readFileSync(resolve(__dirname, "web-links.fixtures.json"), "utf8")));
  });
});
