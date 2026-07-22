import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 023 FR-018 / SC-007 — the SHOP boundary guard.
 *
 * The order now carries a `billing_address` (023) alongside the shipping `delivery_address`. The billing
 * address is payment/invoice data and MUST NEVER reach the shop or any operator fulfilment view. This is
 * enforced *structurally*: billing is its own column, and the shop fulfilment repository selects ONLY
 * `delivery_address`. This test locks that — if anyone ever joins `billing_address` into a shop query,
 * maps it into a shop DTO, or otherwise names "billing" in the fulfilment module, this fails LOUDLY.
 *
 * It also asserts the shop DOES get the shipping address (`delivery_address`) — the boundary is
 * "shipping yes, billing never", not "no address at all".
 */

const HERE = dirname(fileURLToPath(import.meta.url));

// Every non-test source file in the shop fulfilment slice — the entire shop-facing surface for orders.
const SOURCES = [
  "repository.ts",
  "service.ts",
  "handler-support.ts",
  "promise.ts",
  "types.ts",
] as const;

describe("shop fulfilment: billing never crosses the boundary (023 FR-018)", () => {
  for (const file of SOURCES) {
    it(`${file} names no "billing" anywhere`, () => {
      const src = readFileSync(join(HERE, file), "utf8");
      // Case-insensitive: catches billing_address, billingAddress, BillingDTO, a stray comment — anything.
      const matches = src.match(/billing/gi);
      expect(
        matches,
        `${file} references billing — the shop must never see billing data (FR-018). Matches: ${matches?.join(", ")}`,
      ).toBeNull();
    });
  }

  it("the shop repository DOES expose the shipping (delivery) address", () => {
    const repo = readFileSync(join(HERE, "repository.ts"), "utf8");
    // The boundary is "shipping yes, billing never" — prove the shop still gets what it's entitled to.
    expect(repo).toContain("delivery_address");
  });
});
