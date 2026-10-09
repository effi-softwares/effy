import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { MailIdentity } from "../src/audience.js";
import { CATALOG } from "../src/catalog.js";
import { render } from "../src/render.js";

/**
 * order-delivery-changed (081) — back-office moved the order to courier delivery, or back to Effy.
 * Pins what it may say (what changed, when it arrives, what the customer received) and what it may
 * not (why, the courier fee, Effy's cost — the catalogue has no var for them).
 */
const here = dirname(fileURLToPath(import.meta.url));
const vars = JSON.parse(readFileSync(resolve(here, "../src/fixtures/order-delivery-changed.json"), "utf8"));

const identity: MailIdentity = {
  sender: "Effy <no-reply@dev.effyshopping.com>",
  replyToPublic: "hello@effyshopping.com",
  replyToInternal: "workspace-admin@effyshopping.com",
  postalAddress: "1 Test St, Sydney NSW",
};
const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&#x3D;/g, "=").replace(/&amp;/g, "&");

describe("order-delivery-changed", () => {
  it("says what changed, when it arrives and what the customer received, on both parts", () => {
    const out = render("order-delivery-changed", vars, "customer", identity);
    for (const part of [decode(out.html), out.text]) {
      expect(part).toContain(vars.movedLine);
      expect(part).toContain(vars.arrivalLine);
      expect(part).toContain(vars.compensationLine);
      expect(part).toContain(vars.orderUrl);
    }
    expect(out.subject).toContain(vars.orderNumber);
  });

  it("says nothing about compensation when there was none", () => {
    const out = render("order-delivery-changed", { ...vars, hasCompensation: false, compensationLine: "" }, "customer", identity);
    expect(out.text).not.toMatch(/points|refunded/);
  });

  it("has no var for a reason, a fee or a cost", () => {
    expect(Object.keys(CATALOG["order-delivery-changed"].vars).join(" ")).not.toMatch(/reason|fee|cost|difference|note/i);
  });
});
