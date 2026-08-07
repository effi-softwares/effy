import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { render } from "../src/render.js";
import { validateVars } from "../src/catalog.js";
import type { MailIdentity } from "../src/audience.js";

/**
 * The commerce proof (spec US5). order-confirmation is the one template with real data — a line-item
 * table, totals, an address — so it is the one that exercises the object-array var spec, money
 * formatting, and the size budget UNDER RENDER rather than as a static shell.
 */

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, "../src/fixtures");
const loadFixture = (name: string) => JSON.parse(readFileSync(resolve(fixtures, name), "utf8"));

const identity: MailIdentity = {
  sender: "Effy <no-reply@dev.effyshopping.com>",
  replyToPublic: "hello@effyshopping.com",
  replyToInternal: "workspace-admin@effyshopping.com",
  postalAddress: "1 Test St, Sydney NSW",
};

const GMAIL_FAIL = 102 * 1024;

describe("order-confirmation — the large basket", () => {
  const large = loadFixture("order-confirmation.json");

  it("has a genuinely large basket, so the budget test is real (FR-061)", () => {
    // A fixture with three items proves nothing about Gmail's clip. This one is the actual test.
    expect(large.items.length).toBeGreaterThanOrEqual(20);
  });

  it("validates against the object-array schema", () => {
    expect(validateVars("order-confirmation", large)).toEqual([]);
  });

  it("⚠ renders every line item, and stays INSIDE Gmail's clip budget at that size", () => {
    const m = render("order-confirmation", large, "customer", identity);
    // Every item's name appears — the {{#each}} expanded fully.
    for (const item of large.items) {
      expect(m.html).toContain(item.name);
    }
    // ⚠ The RENDERED size (loop expanded), not the static artifact, is what a recipient receives.
    const bytes = Buffer.byteLength(m.html, "utf8");
    expect(bytes, `rendered order-confirmation is ${bytes} B with ${large.items.length} items`)
      .toBeLessThan(GMAIL_FAIL);
  });

  it("presents line items and totals as readable text, not collapsed table debris (FR-060)", () => {
    const m = render("order-confirmation", large, "customer", identity);
    expect(m.text).toContain(large.items[0].name);
    expect(m.text).toContain(large.total);
    expect(m.text).toContain("Total:");
    expect(m.text).not.toContain("<");
  });

  it("carries the money values exactly as given — the template formats nothing (FR-048)", () => {
    const m = render("order-confirmation", large, "customer", identity);
    expect(m.html).toContain(large.total);
    expect(m.html).toContain(large.subtotal);
  });
});

describe("order-confirmation — the hostile basket (escaping, SC-016)", () => {
  const hostile = loadFixture("order-confirmation.hostile.json");

  it("⚠ renders markup in product/shop/address names as inert text, never as structure", () => {
    // SES's own template engine does NOT escape, and product/shop/customer names are user-influenced.
    const m = render("order-confirmation", hostile, "customer", identity);
    // No executable markup from any interpolated value survives.
    expect(m.html).not.toContain("<script>");
    expect(m.html).not.toContain("onerror=");
    expect(m.html).not.toContain("</td></tr><script>");
    // The dangerous characters appear ESCAPED, proving they were rendered as text.
    expect(m.html).toContain("&lt;script&gt;");
  });

  it("cannot break out of a line-item cell to inject a row", async () => {
    const m = render("order-confirmation", hostile, "customer", identity);
    // The injected `"><img …>` from an item name must not produce a live <img>.
    expect(m.html).not.toContain("<img src=x");
  });
});
