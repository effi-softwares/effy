import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { MailIdentity } from "../src/audience.js";
import { CATALOG, validateVars } from "../src/catalog.js";
import { render } from "../src/render.js";

/**
 * order-delivered (053 US3) — the order arrived.
 *
 * ⚠ THE ONLY MESSAGE A WEB-ONLY SHOPPER GETS ABOUT THEIR DELIVERY. Before 053 the three post-payment
 * lifecycle events were push-only, so the entire customer-web audience heard nothing after the
 * receipt. These tests pin the two properties that make it safe to send: it discloses no fulfilment
 * structure, and its plain-text part is actually readable.
 */

const here = dirname(fileURLToPath(import.meta.url));
const loadFixture = (name: string) =>
  JSON.parse(readFileSync(resolve(here, "../src/fixtures", name), "utf8"));

const identity: MailIdentity = {
  sender: "Effy <no-reply@dev.effyshopping.com>",
  replyToPublic: "hello@effyshopping.com",
  replyToInternal: "workspace-admin@effyshopping.com",
  postalAddress: "1 Test St, Sydney NSW",
};

const vars = loadFixture("order-delivered.json");

/** The handful of entities Handlebars' escaper emits — enough to compare a URL honestly. */
const decodeEntities = (s: string) =>
  s
    .replace(/&#x3D;/g, "=")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');

describe("order-delivered — what it says", () => {
  it("names the order and the day it arrived", () => {
    const out = render("order-delivered", vars, "customer", identity);
    expect(out.html).toContain(vars.orderNumber);
    expect(out.html).toContain(vars.deliveredOn);
    expect(out.subject).toContain(vars.orderNumber);
  });

  it("links to the order on both parts", () => {
    const out = render("order-delivered", vars, "customer", identity);
    expect(decodeEntities(out.html)).toContain(vars.orderUrl);
    expect(out.text).toContain(vars.orderUrl);
  });

  /**
   * ⚠ 039's DEFECT, PINNED. Every email's plain-text part was HTML-escaped in the shared render
   * path, because Handlebars turns `=` into `&#x3D;`. Harmless in HTML (clients decode entities in
   * attributes); in text/plain NOTHING decodes it, so a URL arrived unusable — send succeeds, mail
   * arrives, link is visible, and it simply does not work.
   */
  it("does not HTML-escape the URL in the plain-text part", () => {
    const out = render("order-delivered", vars, "customer", identity);
    expect(out.text).not.toContain("&#x3D;");
    expect(out.text).not.toContain("&amp;");
  });

  it("gives the recipient somewhere to go when it did NOT arrive", () => {
    // With no carrier integration, "delivered" is a person's assertion about a package they never
    // saw. A message that asserts it without an escape hatch is a support ticket with no address.
    const out = render("order-delivered", vars, "customer", identity);
    expect(out.text).toContain(identity.replyToPublic);
  });
});

describe("order-delivered — what it must NEVER say", () => {
  /**
   * ⚠ FR-021, THE DISCLOSURE THIS TEMPLATE IS MOST LIKELY TO BREAK. Effy's fulfilment nodes are
   * hidden by the product model: a customer buys from one brand and never learns which shops served
   * them, nor how many. A delivery notice is exactly where "your 2 parcels have arrived" feels
   * helpful and would leak the count.
   *
   * The structural defence is that the catalogue gives this template no var to say it with. This
   * test pins that, so adding one is a deliberate act that fails here first.
   */
  it("has no var that could carry a shop, a package count, or a tracking reference", () => {
    const declared = Object.keys(CATALOG["order-delivered"].vars);
    expect(declared.sort()).toEqual(["deliveredOn", "orderNumber", "orderUrl"]);

    for (const forbidden of ["shop", "package", "parcel", "count", "items", "reference", "tracking"]) {
      expect(
        declared.some((v) => v.toLowerCase().includes(forbidden)),
        `"${forbidden}" must not be a variable on a customer-facing delivery notice (FR-021)`,
      ).toBe(false);
    }
  });

  it("renders no shop name, package count or carrier reference", () => {
    const out = render("order-delivered", vars, "customer", identity);
    const body = `${out.html} ${out.text}`.toLowerCase();
    for (const forbidden of ["parcel", "package", "shop ", "consignment", "tracking number"]) {
      expect(body, `"${forbidden}" appears in a customer delivery notice`).not.toContain(forbidden);
    }
  });

  /** It is not a second receipt — a total here invites reconciling two documents (FR-025's spirit). */
  it("restates no amount", () => {
    const out = render("order-delivered", vars, "customer", identity);
    expect(out.text).not.toMatch(/\$\s?\d/);
  });
});

describe("order-delivered — catalogue rules", () => {
  it("is transactional, so it cannot carry an unsubscribe", () => {
    // The `Category` union gives the transactional arm no field for one, so an unsubscribable
    // delivery notice is a compile error rather than a review catch.
    expect(CATALOG["order-delivered"].category).toBe("transactional");
    const out = render("order-delivered", vars, "customer", identity);
    expect(out.html.toLowerCase()).not.toContain("unsubscribe");
  });

  it("swallows a send failure, because the package already arrived", () => {
    // The arrival is committed and cannot be unwound; a throw would make a caller report failure for
    // something that demonstrably happened. The notification row records it instead.
    expect(CATALOG["order-delivered"].onSendFailure).toBe("swallow");
  });

  it("refuses to render with a missing var", () => {
    const { orderUrl: _dropped, ...incomplete } = vars;
    expect(validateVars("order-delivered", incomplete).length).toBeGreaterThan(0);
  });
});
