import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * ⚠ A CUSTOMER MUST NEVER LEARN WHICH SHOP SERVED THEM. This guard is what keeps that true after
 * 061 gave shops a street address for the first time.
 *
 * Hidden fulfilment is a platform invariant, not a preference: Effy is a single brand, shops are
 * internal nodes, and the customer picks the brand rather than the node. Every customer-facing slice
 * has been written around it — 047 keeps distance, ring and shop identity out of every customer DTO,
 * and 023 FR-018 is why a shop never gets the customer's email either.
 *
 * ⚠ THE RISK IS NOT MALICE, IT IS RESEMBLANCE. A shop address is an ordinary-looking field on an
 * ordinary-looking entity, and the customer services already join `shop` for names and ids. Someone
 * adding "where is my order coming from?" would be writing a sensible-looking line of code. The
 * failure would be silent, permanent, and visible only to a customer.
 *
 * So the absence is asserted over the SOURCE of every customer-facing service, rather than trusted
 * to review — the same shape as 057's refusal guards and 058's `rollup-only` guard, both of which
 * read a directory and fail naming the file.
 */

const here = dirname(fileURLToPath(import.meta.url));
const edgeApi = resolve(here, "..", "..", "..");
const coreApi = resolve(here, "..", "..", "..", "..", "core-api");

/** Services whose responses reach a CUSTOMER. `admin`, `shop` and `fleet` are staff-only. */
const CUSTOMER_FACING = [
  join(edgeApi, "customer", "src"),
  join(coreApi, "internal", "features", "storefront"),
  join(coreApi, "internal", "features", "orders"),
  join(coreApi, "internal", "features", "cart"),
  join(coreApi, "internal", "features", "checkout"),
];

/** The address columns and DTO fields 061 introduced. */
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
    return []; // a service that does not exist yet is not a leak
  }
  return entries.flatMap((e) => {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|go)$/.test(e) && !/\.test\.ts$/.test(e) ? [full] : [];
  });
}

/** Strip comments — a token NAMED in prose is not a token SELECTED in a query. 059 records a defect
 *  where a guard's comment-stripping was itself wrong; this one only removes, never rewrites. */
function withoutComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

describe("hidden fulfilment — a shop's address never reaches a customer", () => {
  it("⚠ no customer-facing service names a shop address field", () => {
    const offenders: string[] = [];

    for (const dir of CUSTOMER_FACING) {
      for (const file of sourceFiles(dir)) {
        const src = withoutComments(readFileSync(file, "utf8"));
        for (const token of ADDRESS_TOKENS) {
          // ⚠ `customer_address` legitimately contains "address"; the tokens above are specific to
          // the SHOP columns 061 added, and `customer_address` has its own distinct column names.
          if (new RegExp(`\\b${token}\\b`).test(src)) {
            offenders.push(`${file.replace(resolve(here, "..", "..", "..", "..", ".."), "")} names "${token}"`);
          }
        }
      }
    }

    expect(offenders, `a shop address must never reach a customer:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("⚠ the guard is looking at real files, so a passing result means something", () => {
    // A guard that silently scans nothing passes forever. 033 shipped a test that passed VACUOUSLY
    // once the list it checked emptied, and 057 shipped one whose injection sailed straight through.
    const scanned = CUSTOMER_FACING.flatMap(sourceFiles);
    expect(scanned.length, "the customer-facing source list resolved to nothing").toBeGreaterThan(20);
  });
});
