import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { MailIdentity } from "../src/audience.js";
import { CATALOG, validateVars } from "../src/catalog.js";
import { render } from "../src/render.js";

/** Money is on its way back: the wording never claims the refund is complete (the bank can still fail it). */

const here = dirname(fileURLToPath(import.meta.url));
const loadFixture = (name: string) =>
  JSON.parse(readFileSync(resolve(here, "../src/fixtures", name), "utf8"));

const identity: MailIdentity = {
  sender: "Effy <no-reply@dev.effyshopping.com>",
  replyToPublic: "hello@effyshopping.com",
  replyToInternal: "workspace-admin@effyshopping.com",
  postalAddress: "1 Test St, Sydney NSW",
};

const vars = loadFixture("order-refunded.json");
const both = (out: { html: string; text: string }) => [out.html, out.text];

describe("order-refunded — what it says", () => {
  it("names the order and the amount, in both parts", () => {
    const out = render("order-refunded", vars, "customer", identity);
    for (const part of both(out)) {
      expect(part).toContain(vars.orderNumber);
      expect(part).toContain(vars.refundAmount);
    }
  });

  // "On its way", never "refunded" or "complete".
  it("says the money is on its way, and never that it has arrived", () => {
    const out = render("order-refunded", vars, "customer", identity);
    for (const part of both(out)) {
      expect(part.toLowerCase()).toContain("on its way");
      expect(part.toLowerCase()).not.toMatch(/refund (is )?(complete|completed)|has been refunded/);
      expect(part.toLowerCase()).not.toMatch(/\bmoney is (now )?in your account\b/);
    }
  });

  // An early refund often shows as a reversal (the charge vanishes), not a separate credit.
  it("warns that it may appear as the charge disappearing, not as a credit", () => {
    const out = render("order-refunded", vars, "customer", identity);
    for (const part of both(out)) {
      expect(part.toLowerCase()).toContain("original charge disappearing");
    }
  });

  it("promises no date, only the policy's own wording", () => {
    const out = render("order-refunded", vars, "customer", identity);
    for (const part of both(out)) {
      expect(part.toLowerCase()).toContain("a few business days");
      expect(part.toLowerCase()).toContain("depends on your bank");
      expect(part).not.toMatch(/\b(tomorrow|by \w+day|within 24 hours)\b/i);
    }
  });
});

describe("what it must never disclose", () => {
  // No shop: the fulfilment nodes are hidden.
  it("names no shop, no provider and no failure reason", () => {
    const out = render("order-refunded", vars, "customer", identity);
    for (const part of both(out)) {
      const lower = part.toLowerCase();
      // "shop" as a whole word: the brand's domain is `effyshopping.com`.
      expect(lower, "order-refunded names a shop").not.toMatch(/\bshops?\b/);
      for (const leak of ["stripe", "declined", "rejected", "card_", "parcel", "package"]) {
        expect(lower, `order-refunded leaks "${leak}"`).not.toContain(leak);
      }
    }
  });

  // The catalogue gives the template no var to make the mistake with.
  it("has no var for a reason, a shop or a provider reference", () => {
    const declared = Object.keys(CATALOG["order-refunded"].vars);
    expect(declared.sort()).toEqual(["orderNumber", "orderUrl", "refundAmount"]);
  });

  // It does not restate the receipt.
  it("carries no order total and no line items", () => {
    const out = render("order-refunded", vars, "customer", identity);
    for (const part of both(out)) {
      expect(part.toLowerCase()).not.toMatch(/order total|subtotal|delivery fee/);
    }
  });
});

describe("how it is classified", () => {
  // Transactional: no unsubscribe.
  it("is transactional, so it carries no unsubscribe", () => {
    expect(CATALOG["order-refunded"].category).toBe("transactional");
    const out = render("order-refunded", vars, "customer", identity);
    expect(out.html.toLowerCase()).not.toContain("unsubscribe");
  });

  /** Swallow: the refund is submitted, and a retry could issue it again. */
  it("swallows a send failure rather than throwing", () => {
    expect(CATALOG["order-refunded"].onSendFailure).toBe("swallow");
  });

  // `validateVars` reports rather than throws; the caller decides.
  it("reports every var it declares as missing", () => {
    const errors = validateVars("order-refunded", { orderNumber: "EFY-1" });
    expect(errors).toHaveLength(2);
    expect(errors.join(" ")).toMatch(/refundAmount/);
    expect(errors.join(" ")).toMatch(/orderUrl/);
    expect(validateVars("order-refunded", vars)).toEqual([]);
  });
});
