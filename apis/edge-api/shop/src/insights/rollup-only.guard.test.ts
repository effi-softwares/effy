import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * FR-026 — INSIGHTS READS THE ROLLUPS, AND NOTHING ELSE (058).
 *
 * ⚠ WHY A SOURCE GUARD RATHER THAN A PERFORMANCE TEST. The rule this protects is invisible at small
 * data: a join onto `order_item` to "just get the unit count" is instant against a dev database with
 * two hundred orders, passes every test, reviews as harmless, and gets slower every single month it
 * exists — until Insights is the screen nobody opens because it hangs. The point of pre-aggregating
 * is lost the first time a read path touches raw rows, and the loss is not observable on the day it
 * happens. So the boundary is asserted where it can actually be enforced: in the source.
 *
 * ⚠ COMMENTS ARE STRIPPED FIRST. Prose must stay free to explain WHY the order tables are out of
 * bounds — including this file and the repository's own header — while the code is held strictly. A
 * guard that fires on its own justification gets deleted by the next person, and takes the
 * requirement with it (057's guard learned this; 054's `guard_test.go` was written that way).
 */

const REPOSITORY = resolve(import.meta.dirname, "repository.ts");
const SERVICE = resolve(import.meta.dirname, "service.ts");

/** Tables that mean "this is an aggregate over raw commerce data". */
const FORBIDDEN = [
  "public.\"order\"",
  "public.order_item",
  "public.shop_fulfillment",
  "public.fulfillment_item",
  "public.refund_line",
];

/** The two tables Insights is allowed to read. */
const ALLOWED = ["public.shop_sales_hour", "public.shop_product_sales_day"];

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/^\s*--.*$/gm, " ");
}

describe("Insights reads only prepared figures (FR-026)", () => {
  const files = [
    ["repository.ts", stripComments(readFileSync(REPOSITORY, "utf8"))],
    ["service.ts", stripComments(readFileSync(SERVICE, "utf8"))],
  ] as const;

  it.each(files)("%s names no raw commerce table", (name, source) => {
    for (const table of FORBIDDEN) {
      expect(
        source.includes(table),
        `${name} references ${table}. Insights must read ONLY the rollups (FR-026) — opening the ` +
          `screen may never start an aggregate over the shop's order history. If a figure is ` +
          `genuinely missing from the rollups, add it to the rollup job and the migration, not to ` +
          `this read path.`,
      ).toBe(false);
    }
  });

  it("does read the rollups, so the guard cannot pass vacuously", () => {
    const repository = files[0][1];
    for (const table of ALLOWED) {
      expect(repository, `the repository should read ${table}`).toContain(table);
    }
  });

  it("the ROLLUP job is the one place allowed to touch raw rows", () => {
    // The asymmetry is the design: one writer reads everything, once a minute, off the user's path;
    // every reader afterwards touches only what that writer prepared.
    const rollup = readFileSync(resolve(import.meta.dirname, "rollup.ts"), "utf8");
    expect(rollup).toContain("public.order_item");
  });
});
