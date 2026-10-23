import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { COVERAGE_LABEL, COVERAGE_REFUSAL_SENTENCE } from "./delivery";

/**
 * The refusal is the same sentence wherever a customer meets it. The server and the website import
 * `delivery.ts`; the mobile app keeps a Kotlin mirror, held here character for character to the source.
 */
const kotlin = resolve(
  __dirname,
  "../../../apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/core/delivery/CoverageWords.kt",
);

describe("the customer app's coverage words", () => {
  it.runIf(existsSync(kotlin))("are exactly the ones declared here", () => {
    const source = readFileSync(kotlin, "utf8");
    const constant = (name: string) => new RegExp(`const val ${name} = "((?:[^"\\\\]|\\\\.)*)"`).exec(source)?.[1];
    expect(constant("DELIVERED_BY_EFFY")).toBe(COVERAGE_LABEL.effy);
    expect(constant("COURIER_DELIVERY")).toBe(COVERAGE_LABEL.courier);
    expect(constant("REFUSAL")).toBe(COVERAGE_REFUSAL_SENTENCE);
  });

  it("the sentence says Effy cannot deliver there, and nothing about why", () => {
    expect(COVERAGE_REFUSAL_SENTENCE).toMatch(/can't deliver to this address/);
    expect(COVERAGE_REFUSAL_SENTENCE).not.toMatch(/zone|area|group|km|courier|postcode/i);
  });
});
