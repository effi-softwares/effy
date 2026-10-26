import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const REPO = fileURLToPath(new URL("../../../../..", import.meta.url));

/**
 * One writer each: the product listing summary only by `refreshListing`; options, values and non-stock
 * variant columns only by variants.ts (stock-only updates are allowed anywhere). No query may name the
 * product price, code, weight or stock columns, which no longer exist.
 */

const EDGE_API = fileURLToPath(new URL("../../..", import.meta.url));
const SERVICES = readdirSync(EDGE_API).filter((d) => statSync(join(EDGE_API, d)).isDirectory() && d !== "node_modules");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    // Test fixtures (src/testing) write rows directly and ship in no service.
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
      // 101: the attribute library rewrites the label copy when a value is renamed.
      const renames = f.endsWith("shared/src/catalog/taxonomy.ts") ? /UPDATE\s+public\.product_option\b/ : /UPDATE\s+public\.product_(option|option_value)\b/;
      if (renames.test(body)) offenders.push(`${rel(f)} updates options`);
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

/** Every TS/TSX source under a directory (tests and generated bundles excluded). */
function tsSources(dir: string): string[] {
  const out: string[] = [];
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    if (["node_modules", "dist", "build", ".next", ".serverless", ".turbo"].includes(name) || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...tsSources(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const writes = (table: string) => new RegExp(`(INSERT INTO|DELETE FROM|UPDATE|TRUNCATE)\\s+(public\\.)?${table}\\b`);
const offendersOf = (table: string, allowed: (f: string) => boolean) =>
  files.filter((f) => !allowed(f)).filter((f) => writes(table).test(readFileSync(f, "utf8"))).map(rel);

describe("101 — the category-driven catalogue has one writer per fact and no product types", () => {
  it("(a) no product types anywhere", () => {
    const roots = ["apis/edge-api", "apps/shop-web/src", "apps/back-office/src", "apps/customer-web", "packages/shared-types/src", "packages/web-kit/src"];
    const offenders = roots
      .flatMap((r) => tsSources(join(REPO, r)))
      .filter((f) => !f.endsWith("catalog.guard.test.ts"))
      .filter((f) => /\bproduct_type\b|\bproductType(Id)?\b|\bProductType(DTO|Attribute)/.test(readFileSync(f, "utf8")))
      .map((f) => relative(REPO, f));
    expect(offenders, "product types are gone (101): classify by the home leaf category").toEqual([]);
  });

  it("(b) storage is a product column, never an attribute looked up by key", () => {
    const offenders = files.filter((f) => /key\s*=\s*'storage'/.test(readFileSync(f, "utf8"))).map(rel);
    expect(offenders, "read p.storage").toEqual([]);
  });

  it("(c) only details.ts writes product details", () => {
    expect(offendersOf("product_attribute_value", (f) => f.endsWith("shared/src/catalog/details.ts"))).toEqual([]);
  });

  it("(d) nothing in TypeScript writes the derived taxonomy (rebuild_category_derived does)", () => {
    for (const t of ["category_ancestor", "category_resolved", "category_form"]) expect(offendersOf(t, () => false), t).toEqual([]);
  });

  it("(e) only the taxonomy writer writes categories, the library and attachments", () => {
    const taxonomy = (f: string) => f.endsWith("shared/src/catalog/taxonomy.ts");
    for (const t of ["category", "attribute_definition", "attribute_allowed_value", "category_attribute"]) {
      expect(offendersOf(t, taxonomy), t).toEqual([]);
    }
  });

  it("(f) only the placements repository writes extra placements", () => {
    expect(offendersOf("product_placement", (f) => f.endsWith("catalog/src/placements/repository.ts") || f.endsWith("shared/src/catalog/taxonomy.ts"))).toEqual([]);
  });

  it("(g) every storefront read of the attribute library filters to customer-visible attributes", () => {
    const offenders: string[] = [];
    for (const f of files.filter((x) => rel(x).startsWith("storefront/src/"))) {
      for (const m of readFileSync(f, "utf8").matchAll(/`[^`]*attribute_definition[^`]*`/g)) {
        if (!/customer_visible/.test(m[0])) offenders.push(rel(f));
      }
    }
    expect(offenders, "an internal-only attribute must never reach a customer (FR-032)").toEqual([]);
  });

  it("(h) the old catalogue routes stay deleted", () => {
    const offenders = files
      .map(rel)
      .filter((f) => /^admin\/src\/functions\/catalog-/.test(f) || /^catalog\/src\/functions\/gst-/.test(f) || /^shop\/src\/functions\/catalog-schema-/.test(f));
    expect(offenders).toEqual([]);
  });
});
