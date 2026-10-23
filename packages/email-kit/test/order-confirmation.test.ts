import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { render } from "../src/render.js";
import { validateVars } from "../src/catalog.js";
import type { MailIdentity } from "../src/audience.js";

/** The one template with real data: the object-array spec, money formatting and the rendered size budget. */

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
    // A large basket: three items prove nothing about Gmail's clip.
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
    // The rendered size (loop expanded) is what a recipient receives.
    const bytes = Buffer.byteLength(m.html, "utf8");
    expect(bytes, `rendered order-confirmation is ${bytes} B with ${large.items.length} items`)
      .toBeLessThan(GMAIL_FAIL);
  });

  it("presents line items and totals as readable text, not collapsed table debris (FR-060)", () => {
    const m = render("order-confirmation", large, "customer", identity);
    expect(m.text).toContain(large.items[0].name);
    expect(m.text).toContain(large.total);
    expect(m.text).toContain("Total paid:");
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
    // Ses's own template engine does not escape, and product/shop/customer names are user-influenced.
    const m = render("order-confirmation", hostile, "customer", identity);
    // No executable markup from any interpolated value survives.
    expect(m.html).not.toContain("<script>");
    expect(m.html).not.toContain("onerror=");
    expect(m.html).not.toContain("</td></tr><script>");
    // The dangerous characters appear escaped, proving they were rendered as text.
    expect(m.html).toContain("&lt;script&gt;");
  });

  it("cannot break out of a line-item cell to inject a row", async () => {
    const m = render("order-confirmation", hostile, "customer", identity);
    // The injected `"><img …>` from an item name must not produce a live <img>.
    expect(m.html).not.toContain("<img src=x");
  });
});

describe("order-confirmation — 052's additions", () => {
  const large = loadFixture("order-confirmation.json");

  it("shows the UNIT PRICE beside every line, not just the line total (FR-003)", () => {
    const m = render("order-confirmation", large, "customer", identity);
    for (const item of large.items.slice(0, 5)) {
      expect(m.html).toContain(item.unitPrice);
      expect(m.text).toContain(item.unitPrice);
    }
  });

  it("carries the payment method, the placed timestamp and the method label", () => {
    const m = render("order-confirmation", large, "customer", identity);
    for (const v of [large.paymentMethod, large.placedAt, large.deliveryMethod]) {
      expect(m.html).toContain(v);
      expect(m.text).toContain(v);
    }
  });

  /** subtotal − discount + delivery = total, as a shopper can check. */
  it("the fixture's own totals reconcile", () => {
    const n = (s: string) => Number(s.replace(/[^0-9.]/g, ""));
    const lines = large.items.reduce((t: number, i: { lineTotal: string }) => t + n(i.lineTotal), 0);
    expect(lines).toBeCloseTo(n(large.subtotal), 2);
    expect(n(large.subtotal) - n(large.discountAmount) + n(large.deliveryFee)).toBeCloseTo(
      n(large.total),
      2,
    );
  });

  /** A zero component is omitted, never "$0.00" or a dash (which reads as unknown). */
  it("omits the discount, delivery and payment rows when they do not apply", () => {
    const plain = {
      ...large,
      hasDiscount: false,
      discountLabel: "",
      discountAmount: "",
      hasDeliveryFee: false,
      deliveryFee: "",
      hasDeliveryLines: false,
      deliveryLines: [],
      hasPaymentMethod: false,
      paymentMethod: "",
    };
    const m = render("order-confirmation", plain, "customer", identity);
    expect(m.html).not.toContain("Discount");
    expect(m.html).not.toContain(">Delivery<");
    expect(m.html).not.toContain("Paid with");
    expect(m.text).not.toContain("Paid with");
    // The document is still whole.
    expect(m.html).toContain("Total paid");
    expect(m.text).toContain("Total paid:");
  });

  it("renders a divergent billing address, and says 'same as delivery' otherwise", () => {
    const same = render("order-confirmation", large, "customer", identity);
    expect(same.text).toContain("Same as delivery");

    const diverged = render(
      "order-confirmation",
      { ...large, billingSameAsDelivery: false, billingAddress: "9 Other Rd, Carlton VIC 3053" },
      "customer",
      identity,
    );
    expect(diverged.html).toContain("9 Other Rd");
    expect(diverged.text).toContain("9 Other Rd");
  });

  /** The text part is not HTML-escaped: `?token=ABC` must not become `?token&#x3D;ABC`. */
  it("⚠ leaves the text part UNESCAPED — the order link must be usable in a plain-text client", () => {
    const m = render(
      "order-confirmation",
      { ...large, orderUrl: "https://effyshopping.com/orders/8f2c1a?token=ABC&ref=email" },
      "customer",
      identity,
    );
    expect(m.text).toContain("https://effyshopping.com/orders/8f2c1a?token=ABC&ref=email");
    for (const entity of ["&#x3D;", "&amp;", "&#39;", "&quot;", "&lt;"]) {
      expect(m.text).not.toContain(entity);
    }
  });

  /** Every figure survives with images blocked and as plain text. */
  it("carries every figure in the text part", () => {
    const m = render("order-confirmation", large, "customer", identity);
    for (const v of [large.subtotal, large.discountAmount, large.total]) {
      expect(m.text).toContain(v);
    }
    expect(m.text).toContain(large.orderNumber);
  });

  /** The delivery charge prints as the lines it was sold with, in place of the single row, summing to it. */
  it("077 — prints the delivery lines instead of the single Delivery row, in both parts", () => {
    const m = render("order-confirmation", large, "customer", identity);
    for (const l of large.deliveryLines as { label: string; amount: string }[]) {
      expect(m.html).toContain(l.label);
      expect(m.html).toContain(l.amount);
      expect(m.text).toContain(`${l.label}: ${l.amount}`);
    }
    expect(m.text).not.toContain(`Delivery: ${large.deliveryFee}`);
    const n = (x: string) => Number(x.replace(/[^0-9.-]/g, ""));
    const sum = (large.deliveryLines as { amount: string }[]).reduce((t, l) => t + n(l.amount), 0);
    expect(sum).toBeCloseTo(n(large.deliveryFee), 2);
  });

  it("077 — an order placed before the fee engine keeps its single Delivery row", () => {
    const m = render("order-confirmation", { ...large, hasDeliveryLines: false, deliveryLines: [] }, "customer", identity);
    expect(m.text).toContain(`Delivery: ${large.deliveryFee}`);
    expect(m.text).not.toContain("Window surcharge");
  });

  it("077 — a free delivery is printed, as the lines that make its $0.00", () => {
    const free = {
      ...large,
      deliveryFee: "$0.00",
      deliveryLines: [{ label: "Delivery", amount: "$6.00" }, { label: "Free delivery", amount: "-$6.00" }],
    };
    const m = render("order-confirmation", free, "customer", identity);
    expect(m.text).toContain("Free delivery: -$6.00");
  });

  /** Nobody can opt out of their own proof of purchase. */
  it("⚠ carries NO unsubscribe affordance", () => {
    const m = render("order-confirmation", large, "customer", identity);
    expect(m.html.toLowerCase()).not.toContain("unsubscribe");
    expect(m.text.toLowerCase()).not.toContain("unsubscribe");
  });

  /** No fabricated legal identifier while the operator's values are unsupplied. */
  it("⚠ shows NO ABN, no GST amount and does not call itself a tax invoice", () => {
    const m = render("order-confirmation", large, "customer", identity);
    for (const body of [m.html, m.text]) {
      expect(body).not.toMatch(/\bABN\b/);
      expect(body).not.toMatch(/\bGST\s*(amount|total|payable)\b/i);
      expect(body).not.toMatch(/\[ABN\]|\[LEGAL_ENTITY_NAME\]|\[REGISTERED_ADDRESS\]/);
    }
    // It says what it is, and how to get a tax invoice.
    expect(m.text).toContain("record of payment");
    expect(m.text).toContain("tax invoice");
  });

  /** The preheader must not repeat the subject or restate the amount. */
  it("⚠ the preheader restates neither the subject nor the total", () => {
    const m = render("order-confirmation", large, "customer", identity);
    expect(m.subject).toContain(large.orderNumber);
    // The preview line lives in the html head; assert on what it must not carry.
    const preview = /<mj-preview>([\s\S]*?)<\/mj-preview>|id="preheader"[^>]*>([\s\S]*?)</.exec(m.html);
    const line = (preview?.[1] ?? preview?.[2] ?? "").trim();
    if (line) {
      expect(line).not.toContain(large.total);
      expect(line).not.toBe(m.subject);
    }
  });
});
