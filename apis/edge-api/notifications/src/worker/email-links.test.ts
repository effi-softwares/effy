import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { customerWebUrlFor, parseWebLink, type CustomerDestination } from "@effy/shared-types";
import { messageEmailVars } from "@effy/edge-shared/notifications";
import { describe, expect, it } from "vitest";

/**
 * 116 FR-007: every shopper link Effy writes in an email is a page the customer app opens (so the same link opens the app
 * where it is installed, and the website otherwise); the unsubscribe link never is.
 */
const SITE = "https://dev.example.test";
const path = (url: string) => url.slice(SITE.length);

describe("116 - links in emails", () => {
  it.each<CustomerDestination>([
    { kind: "home" }, { kind: "orders" }, { kind: "order", orderId: "o-1" }, { kind: "points" },
    { kind: "product", productId: "p-1" }, { kind: "aisle", aisleKey: "dairy" }, { kind: "search", query: "milk" }, { kind: "sale" },
  ])("%o is a page the app opens", (d) => {
    const url = customerWebUrlFor(`${SITE}/`, d);
    expect(url.startsWith(`${SITE}/`)).toBe(true);
    expect(parseWebLink(path(url)).destination?.kind).toBe(d.kind);
  });

  it("a message email's button opens the app; its unsubscribe link never does", () => {
    const built = messageEmailVars(
      { to: "a@example.test", recipientSub: "s", messageId: "m-1", category: "offers", title: "From Effy", body: "An offer from Effy",
        destination: { kind: "sale" }, imageUrl: null },
      { givenName: null, token: "T".repeat(43) },
      { site: SITE, edge: "https://edge.example.test" },
    )!;
    expect(parseWebLink(path(built.vars.buttonUrl)).destination).toEqual({ kind: "sale" });
    expect(parseWebLink(path(built.vars.unsubscribeUrl)).destination).toBeNull();
  });

  it("no email sender builds a shopper link by hand", () => {
    const root = resolve(__dirname, "..");
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f.endsWith(".ts") && !f.includes(".test.") ? [join(d, f)] : []));
    const handBuilt = walk(root).filter((f) => /\$\{[a-zA-Z.]*(site|siteUrl)[^}]*\}[^`]*\/(orders|account|product|search|offers)\b/.test(readFileSync(f, "utf8")));
    expect(handBuilt.map((f) => relative(root, f))).toEqual([]);
  });
});
