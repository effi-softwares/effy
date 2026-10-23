import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * `product.gst_status` changes only through `setGstStatus`, which writes the append-only
 * `product_gst_change` row too; the delivery note never selects a price or a shop name.
 */
const here = dirname(fileURLToPath(import.meta.url));
const services = resolve(here, "../../..");
const SKIP = new Set(["node_modules", "build", "dist", ".serverless", "generated"]);

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = resolve(dir, name);
    if (statSync(path).isDirectory()) files(path, out);
    else if (name.endsWith(".ts") && !/\.(test|spec)\.ts$/.test(name)) out.push(path);
  }
  return out;
}
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(\/\/|--).*$/gm, "");
const sources = files(services).map((f) => ({ file: relative(services, f), src: strip(readFileSync(f, "utf8")) }));
const WRITER = "shared/src/documents/gst-status.ts";

describe("096 — the documents' one writers", () => {
  it("scans the services", () => expect(sources.length).toBeGreaterThan(300));

  it("only setGstStatus changes a product's GST status", () => {
    const setting = sources
      .filter((s) => /UPDATE\s+public\.product\b(?:(?!;|`).)*\bgst_status\s*=/s.test(s.src))
      .map((s) => s.file);
    expect(setting).toEqual([WRITER]);
  });

  it("only setGstStatus writes the GST history, and nothing updates or deletes it", () => {
    expect(sources.filter((s) => /INSERT INTO\s+public\.product_gst_change\b/.test(s.src)).map((s) => s.file)).toEqual([WRITER]);
    expect(sources.filter((s) => /(UPDATE|DELETE FROM)\s+public\.product_gst_change\b/.test(s.src)).map((s) => s.file)).toEqual([]);
  });

  it("the delivery note selects no price and no shop name", () => {
    const note = sources.find((s) => s.file === "shared/src/documents/delivery-note.ts")!.src;
    expect(note).not.toMatch(/price_amount|unit_price|line_subtotal|s\.name|shop_name/);
  });

  /** A customer's documents never name a shop or count shops or bags. */
  it("no customer document builder reads a shop, a package count or a bag", () => {
    for (const file of ["shared/src/documents/delivery-note.ts", "shared/src/documents/tax-invoice.ts"]) {
      const src = sources.find((x) => x.file === file)!.src;
      const sql = (src.match(/`[\s\S]*?`/g) ?? []).join("\n");
      expect(sql, file).not.toMatch(/public\.shop\b|s\.name|shop_name|package_parcel|count\(\*\)[^`]*shop_fulfillment/);
    }
  });

  it("the customer document contract has no shop, package or bag field", () => {
    const types = readFileSync(resolve(services, "../../packages/shared-types/src/documents.ts"), "utf8");
    const customer = ["DeliveryNoteDTO", "DeliveryNoteLineDTO", "TaxDocumentDTO", "OrderTaxDocumentsDTO", "BusinessIdentityRequest"];
    for (const name of customer) {
      const body = types.match(new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`))?.[1];
      expect(body, `${name} is declared`).toBeDefined();
      const fields = strip(body!).match(/^\s*(\w+)\??:/gm) ?? [];
      expect(fields.join(" "), name).not.toMatch(/shop|parcel|bag|package/i);
    }
  });
});
