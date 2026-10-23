import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

/** Shipping yes, billing never: no fulfilment source may name billing, and the shop still gets `delivery_address`. */

const HERE = dirname(fileURLToPath(import.meta.url));

const SOURCES = [
  "repository.ts",
  "service.ts",
  "handler-support.ts",
  "promise.ts",
  "types.ts",
  // The order console reads the order row itself, one column from billing, so it is held to the same rule.
  "../orders/repository.ts",
  "../orders/service.ts",
  "../orders/handler-support.ts",
  "../orders/types.ts",
] as const;

describe("shop fulfilment: billing never crosses the boundary (023 FR-018)", () => {
  for (const file of SOURCES) {
    it(`${file} names no "billing" anywhere`, () => {
      const src = readFileSync(join(HERE, file), "utf8");
      // Case-insensitive: billing_address, billingAddress, BillingDTO, a stray comment.
      const matches = src.match(/billing/gi);
      expect(
        matches,
        `${file} references billing — the shop must never see billing data (FR-018). Matches: ${matches?.join(", ")}`,
      ).toBeNull();
    });
  }

  it("the shop repository DOES expose the shipping (delivery) address", () => {
    const repo = readFileSync(join(HERE, "repository.ts"), "utf8");
    expect(repo).toContain("delivery_address");
  });
});
