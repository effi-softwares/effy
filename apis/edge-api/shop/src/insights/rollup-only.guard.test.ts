import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Insights reads the rollups and nothing else: a join onto raw order rows is invisible at small data and
 * slower every month. Comments are stripped, so prose may explain the rule.
 */

const REPOSITORY = resolve(import.meta.dirname, "repository.ts");
const SERVICE = resolve(import.meta.dirname, "service.ts");

const FORBIDDEN = [
  "public.\"order\"",
  "public.order_item",
  "public.shop_fulfillment",
  "public.fulfillment_item",
  "public.refund_line",
];

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
    // One writer reads everything, once a minute, off the user's path; every reader touches only its output.
    const rollup = readFileSync(resolve(import.meta.dirname, "rollup.ts"), "utf8");
    expect(rollup).toContain("public.order_item");
  });
});
