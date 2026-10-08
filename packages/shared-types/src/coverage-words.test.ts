import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { COVERAGE_LABEL, COVERAGE_REFUSAL_SENTENCE } from "./delivery";

/**
 * ⚠ THE REFUSAL IS THE SAME SENTENCE WHEREVER A CUSTOMER MEETS IT (076 FR-022, SC-004).
 *
 * The server and the website import the constants in `delivery.ts`. The mobile app cannot import a
 * TypeScript file, so it keeps a mirror — and a mirror nobody checks is a second wording waiting to
 * happen (before 076 the refusal existed three times, in three wordings). This reads the Kotlin and
 * holds it, character for character, to the source.
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
