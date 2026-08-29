import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { MailIdentity } from "../src/audience.js";
import { CATALOG, validateVars } from "../src/catalog.js";
import { render } from "../src/render.js";

/**
 * order-refunded (055 US5, FR-027) — money is on its way back.
 *
 * ⚠ THE PROPERTY THAT MATTERS MOST IS WHAT THIS MESSAGE MUST NOT CLAIM. The provider accepting a
 * refund is not the bank moving it: that can take days and can still fail up to thirty days later.
 * A message saying "your refund is complete" would be the one claim that stops a shopper looking for
 * money that never turned up — so these tests pin the wording, not just the variables.
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

  // ⚠ "on its way", never "refunded" / "complete". See the note at the top of this file.
  it("says the money is on its way, and never that it has arrived", () => {
    const out = render("order-refunded", vars, "customer", identity);
    for (const part of both(out)) {
      expect(part.toLowerCase()).toContain("on its way");
      expect(part.toLowerCase()).not.toMatch(/refund (is )?(complete|completed)|has been refunded/);
      expect(part.toLowerCase()).not.toMatch(/\bmoney is (now )?in your account\b/);
    }
  });

  // ⚠ A refund issued soon after payment often appears as a REVERSAL — the original charge simply
  // vanishes and no separate credit ever shows up (research R2). A customer told to look for a
  // credit will not find one, and will write to us about money already returned.
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
  // ⚠ Effy's fulfilment nodes are hidden by the product model: a customer buys from one brand and
  // never learns which shops served them, nor how many.
  it("names no shop, no provider and no failure reason", () => {
    const out = render("order-refunded", vars, "customer", identity);
    for (const part of both(out)) {
      const lower = part.toLowerCase();
      // ⚠ "shop" is checked as a WHOLE WORD, not a substring — the brand's own domain is
      // `effyshopping.com`, so a naive `.contains("shop")` fails on the footer of every message the
      // platform sends. A sweep that cannot survive the company's own name is a sweep that gets
      // deleted rather than fixed.
      expect(lower, "order-refunded names a shop").not.toMatch(/\bshops?\b/);
      for (const leak of ["stripe", "declined", "rejected", "card_", "parcel", "package"]) {
        expect(lower, `order-refunded leaks "${leak}"`).not.toContain(leak);
      }
    }
  });

  // ⚠ The strongest form of that guarantee: the catalogue gives the template no var to make the
  // mistake with, exactly as `order-delivered` has no `items` var.
  it("has no var for a reason, a shop or a provider reference", () => {
    const declared = Object.keys(CATALOG["order-refunded"].vars);
    expect(declared.sort()).toEqual(["orderNumber", "orderUrl", "refundAmount"]);
  });

  // ⚠ It does not restate the receipt. What was charged is a historical record sent at payment;
  // repeating the order total invites reconciling two documents produced at different moments.
  it("carries no order total and no line items", () => {
    const out = render("order-refunded", vars, "customer", identity);
    for (const part of both(out)) {
      expect(part.toLowerCase()).not.toMatch(/order total|subtotal|delivery fee/);
    }
  });
});

describe("how it is classified", () => {
  // ⚠ Money leaving Effy's hands is the completion of a purchase, not marketing. The `Category`
  // union makes an unsubscribable one a COMPILE error; this pins the choice that was made.
  it("is transactional, so it carries no unsubscribe", () => {
    expect(CATALOG["order-refunded"].category).toBe("transactional");
    const out = render("order-refunded", vars, "customer", identity);
    expect(out.html.toLowerCase()).not.toContain("unsubscribe");
  });

  /**
   * ⚠ `swallow`. The refund has already been SUBMITTED and that transaction is committed. A throw
   * would report a failure for something that demonstrably happened — and a retry could issue the
   * refund a second time.
   */
  it("swallows a send failure rather than throwing", () => {
    expect(CATALOG["order-refunded"].onSendFailure).toBe("swallow");
  });

  // ⚠ `validateVars` REPORTS rather than throws — the caller decides. Asserting a throw here would
  // have been a test written from an assumption about the helper instead of from the helper.
  it("reports every var it declares as missing", () => {
    const errors = validateVars("order-refunded", { orderNumber: "EFY-1" });
    expect(errors).toHaveLength(2);
    expect(errors.join(" ")).toMatch(/refundAmount/);
    expect(errors.join(" ")).toMatch(/orderUrl/);
    expect(validateVars("order-refunded", vars)).toEqual([]);
  });
});
