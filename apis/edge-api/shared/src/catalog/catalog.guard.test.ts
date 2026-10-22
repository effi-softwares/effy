import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 098 — ONE WRITER EACH, AND NO READER OF A COLUMN THAT IS GONE.
 *
 * (a) The listing summary on `product` (list_price_amount, list_compare_at_amount, price_varies) is
 *     written only by `refreshListing` (listing.ts). A second writer would let it disagree with the
 *     variants it summarises — the listing showing one price while the product page shows another,
 *     with nothing failing.
 * (b) Options, values and every non-stock variant column are written only by variants.ts. Stock
 *     columns have their own writers (054), so an UPDATE of product_variant that sets only stock
 *     columns is allowed anywhere.
 * (c) 098 DROPPED product's price, code, weight and stock columns. A query naming one fails at run
 *     time, in production, on the first request that reaches it — so this fails at test time instead.
 */

const EDGE_API = fileURLToPath(new URL("../../..", import.meta.url));
const SERVICES = readdirSync(EDGE_API).filter((d) => statSync(join(EDGE_API, d)).isDirectory() && d !== "node_modules");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    // Test-only fixtures (src/testing) write rows directly, as a test must; they ship in no service.
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts") && !full.includes("/src/testing/")) out.push(full);
  }
  return out;
}

const files = SERVICES.flatMap((s) => {
  const src = join(EDGE_API, s, "src");
  try {
    return statSync(src).isDirectory() ? sourceFiles(src) : [];
  } catch {
    return [];
  }
});
const rel = (f: string) => relative(EDGE_API, f);

describe("098 — variant writers and the dropped product columns", () => {
  it("scans the backend", () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it("(a) only refreshListing writes the listing summary", () => {
    const offenders = files
      .filter((f) => !f.endsWith("shared/src/catalog/listing.ts"))
      .filter((f) => /\b(list_price_amount|list_compare_at_amount|price_varies)\s*=(?!=)/.test(readFileSync(f, "utf8")))
      .map(rel);
    expect(offenders, "write the listing summary through refreshListing").toEqual([]);
  });

  it("(b) only variants.ts writes options, values and non-stock variant columns", () => {
    const STOCK = new Set(["stock_on_hand", "stock_tracked", "low_stock_threshold"]);
    const offenders: string[] = [];
    for (const f of files) {
      if (f.endsWith("shared/src/catalog/variants.ts")) continue;
      const body = readFileSync(f, "utf8");
      if (/(INSERT INTO|DELETE FROM)\s+public\.product_(option|option_value|variant)\b/.test(body)) offenders.push(`${rel(f)} inserts/deletes`);
      for (const m of body.matchAll(/UPDATE\s+public\.product_variant\b[\s\S]*?\bSET\b([\s\S]*?)(\bWHERE\b|\bFROM\b|\bRETURNING\b|`)/g)) {
        const cols = [...m[1]!.matchAll(/(?:^|,)\s*([a-z_]+)\s*=/g)].map((c) => c[1]!);
        const bad = cols.filter((c) => !STOCK.has(c));
        if (bad.length > 0) offenders.push(`${rel(f)} sets ${bad.join(", ")}`);
      }
      if (/UPDATE\s+public\.product_(option|option_value)\b/.test(body)) offenders.push(`${rel(f)} updates options`);
    }
    expect(offenders, "write variants through applyVariantSet / priceVariants / setVariantState").toEqual([]);
  });

  it("(c) nothing reads a product column 098 dropped", () => {
    const DROPPED = /\b(?:p|product)\.(price_amount|compare_at_amount|shop_price_amount|shop_compare_at_amount|sku|gtin|weight_grams|weight_is_assumed|stock_tracked|stock_on_hand|low_stock_threshold)\b/;
    const offenders: string[] = [];
    for (const f of files) {
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith("//") || t.startsWith("*") || t.startsWith("--")) return;
        if (DROPPED.test(line) && !line.includes("variant-alias:")) offenders.push(`${rel(f)}:${i + 1}  ${t}`);
      });
    }
    expect(offenders, "these lines read a column that moved to product_variant (alias it v, or mark `variant-alias:` if p is not a product)").toEqual([]);
  });
});
