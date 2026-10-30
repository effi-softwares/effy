import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A customer must never learn which shop served them: the shop address columns must not appear in the
 * source of any customer-facing service.
 */

const here = dirname(fileURLToPath(import.meta.url));
const edgeApi = resolve(here, "..", "..", "..");

/** Services whose responses reach a customer, including the shared modules they bundle. */
const CUSTOMER_FACING = [
  join(edgeApi, "customer", "src"),
  join(edgeApi, "storefront", "src"),
  join(edgeApi, "commerce", "src"),
  join(edgeApi, "shared", "src", "delivery"),
  join(edgeApi, "shared", "src", "cart-policy"),
  join(edgeApi, "shared", "src", "payments"),
];

const ADDRESS_TOKENS = [
  "address_line1",
  "address_line2",
  "addressLine1",
  "addressLine2",
];

function sourceFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((e) => {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.ts$/.test(e) && !/\.test\.ts$/.test(e) ? [full] : [];
  });
}

/** Strips comments only, so a name in prose is not mistaken for a selected column. */
function withoutComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

describe("hidden fulfilment - a shop's address never reaches a customer", () => {
  it("⚠ no customer-facing service names a shop address field", () => {
    const offenders: string[] = [];

    for (const dir of CUSTOMER_FACING) {
      for (const file of sourceFiles(dir)) {
        const src = withoutComments(readFileSync(file, "utf8"));
        for (const token of ADDRESS_TOKENS) {
          // `customer_address` has its own distinct column names.
          if (new RegExp(`\\b${token}\\b`).test(src)) {
            offenders.push(`${file.replace(resolve(here, "..", "..", "..", "..", ".."), "")} names "${token}"`);
          }
        }
      }
    }

    expect(offenders, `a shop address must never reach a customer:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("⚠ the guard is looking at real files, so a passing result means something", () => {
    // A guard that scans nothing passes forever.
    const scanned = CUSTOMER_FACING.flatMap(sourceFiles);
    expect(scanned.length, "the customer-facing source list resolved to nothing").toBeGreaterThan(100);
    // Every root, so one moved service cannot hide behind the others.
    for (const dir of CUSTOMER_FACING) expect(sourceFiles(dir).length, `${dir} has no source - was it moved?`).toBeGreaterThan(0);
  });
});
