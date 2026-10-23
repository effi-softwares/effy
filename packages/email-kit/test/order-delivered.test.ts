import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { MailIdentity } from "../src/audience.js";
import { CATALOG, validateVars } from "../src/catalog.js";
import { render } from "../src/render.js";

/** The order arrived: the only delivery message a web-only shopper gets. It discloses no fulfilment structure, and its text part is readable. */

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

/** The entities Handlebars' escaper emits, to compare a URL honestly. */
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

  /** The text part is not HTML-escaped, so its URL works. */
  it("does not HTML-escape the URL in the plain-text part", () => {
    const out = render("order-delivered", vars, "customer", identity);
    expect(out.text).not.toContain("&#x3D;");
    expect(out.text).not.toContain("&amp;");
  });

  it("gives the recipient somewhere to go when it did NOT arrive", () => {
    // "Delivered" is a person's assertion, so the message offers a way to say it did not arrive.
    const out = render("order-delivered", vars, "customer", identity);
    expect(out.text).toContain(identity.replyToPublic);
  });
});

describe("order-delivered — what it must NEVER say", () => {
  /** No shop and no package count: the catalogue gives this template no var to say them with. */
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

  /** Not a second receipt: no total. */
  it("restates no amount", () => {
    const out = render("order-delivered", vars, "customer", identity);
    expect(out.text).not.toMatch(/\$\s?\d/);
  });
});

describe("order-delivered — catalogue rules", () => {
  it("is transactional, so it cannot carry an unsubscribe", () => {
    // The `Category` union already makes an unsubscribable notice a compile error.
    expect(CATALOG["order-delivered"].category).toBe("transactional");
    const out = render("order-delivered", vars, "customer", identity);
    expect(out.html.toLowerCase()).not.toContain("unsubscribe");
  });

  it("swallows a send failure, because the package already arrived", () => {
    // Swallow: the arrival is committed; the notification row records a failed send.
    expect(CATALOG["order-delivered"].onSendFailure).toBe("swallow");
  });

  it("refuses to render with a missing var", () => {
    const { orderUrl: _dropped, ...incomplete } = vars;
    expect(validateVars("order-delivered", incomplete).length).toBeGreaterThan(0);
  });
});
