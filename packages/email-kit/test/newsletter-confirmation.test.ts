import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { render } from "../src/render.js";
import { CATALOG, validateVars } from "../src/catalog.js";
import type { MailIdentity } from "../src/audience.js";

const here = dirname(fileURLToPath(import.meta.url));
const loadFixture = (name: string) =>
  JSON.parse(readFileSync(resolve(here, "../src/fixtures", name), "utf8"));

const identity: MailIdentity = {
  sender: "Effy <no-reply@dev.effyshopping.com>",
  replyToPublic: "hello@effyshopping.com",
  replyToInternal: "workspace-admin@effyshopping.com",
  postalAddress: "1 Test St, Sydney NSW",
};

const vars = loadFixture("newsletter-confirmation.json");

const decodeEntities = (s: string) =>
  s
    .replace(/&#x3D;/g, "=")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');

describe("newsletter-confirmation - the confirm link", () => {
  it("validates against its declared variables", () => {
    expect(validateVars("newsletter-confirmation", vars)).toEqual([]);
  });

  it("carries the confirm URL in the HTML *and* the text part", () => {
    const m = render("newsletter-confirmation", vars, "customer", identity);

    const href = /href="([^"]*confirm[^"]*)"/.exec(m.html)?.[1] ?? "";
    expect(decodeEntities(href)).toBe(vars.confirmUrl);

    expect(m.text).toContain(vars.confirmUrl);
    expect(m.text).not.toContain("&#x3D;");
  });

  it("states how long the link lasts, in both parts", () => {
    const m = render("newsletter-confirmation", vars, "customer", identity);

    expect(m.html).toContain(vars.expiresIn);
    expect(m.text).toContain(vars.expiresIn);
  });

  it("tells a recipient who never signed up that ignoring it is enough", () => {
    const m = render("newsletter-confirmation", vars, "customer", identity);

    expect(m.text.toLowerCase()).toMatch(/ignore this email/);
    expect(m.html.toLowerCase()).toMatch(/ignore this email/);
  });
});

describe("newsletter-confirmation - no unbacked claim", () => {
  it("promises no discount, incentive or reward", () => {
    const m = render("newsletter-confirmation", vars, "customer", identity);
    const body = `${m.html} ${m.text} ${m.subject}`.toLowerCase();

    expect(body).not.toMatch(/\d+\s*%\s*(off|discount)/);
    expect(body).not.toMatch(/\bvoucher\b|\bcoupon\b|\breward\b|\bfree (delivery|shipping)\b/);
    expect(body).not.toMatch(/\bdiscount\b/);
  });
});

describe("newsletter-confirmation - catalogue rules", () => {
  it("throws on send failure, so the visitor can retry", () => {
    expect(CATALOG["newsletter-confirmation"].onSendFailure).toBe("throw");
  });

  it("is sent by the platform, not by Cognito", () => {
    expect(CATALOG["newsletter-confirmation"].sentBy).toBe("platform");
  });
});
