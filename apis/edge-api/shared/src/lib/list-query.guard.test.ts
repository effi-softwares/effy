import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { EDGE_API_DIR, functionsOf, listStacks } from "./serverless-stacks";

/**
 * 103: every console list goes through `parseListQuery` (one way to search, sort, page and count), no list
 * splices its own ORDER BY, and no list stops at a fixed number of rows. The two allow-lists below shrink to
 * empty as the lists are converted; T058 asserts they are empty.
 */

/** Every console list route (contracts/list-contract.md). Method GET. */
const LIST_ROUTES = [
  "/orders/v1/orders",
  "/catalog/v1/products",
  "/catalog/v1/review",
  "/catalog/v1/products/missing-details",
  "/catalog/v1/review/margin-not-set",
  "/catalog/v1/imports",
  "/catalog/v1/taxonomy/attributes",
  "/admin/v1/promotions",
  "/admin/v1/promotions/{id}/codes",
  "/admin/v1/promotions/{id}/customers",
  "/admin/v1/shops",
  "/admin/v1/shops/{shopId}/audit",
  "/inventory/v1/admin/shops/{shopId}/low-stock",
  "/inventory/v1/low-stock",
  "/fleet/v1/drivers",
  "/fleet/v1/vehicles",
  "/orders/v1/customers",
  "/orders/v1/customers/{customerId}/points/history",
  "/admin/v1/feedback",
  "/admin/v1/deliverability",
  "/admin/v1/delivery/coverage",
  "/orders/v1/handovers",
  "/fleet/v1/exceptions",
  "/shop/v1/orders",
  "/shop/v1/products",
  "/shop/v1/availability",
] as const;

/** Lists not converted yet, with the task that converts them. Must be empty when 103 is done. */
export const PENDING_LIST_ROUTES: Readonly<Record<string, string>> = {
  "/catalog/v1/products": "T028",
  "/catalog/v1/review": "T029",
  "/catalog/v1/products/missing-details": "T030",
  "/catalog/v1/review/margin-not-set": "T030",
  "/catalog/v1/imports": "T031",
  "/catalog/v1/taxonomy/attributes": "T032",
  "/admin/v1/promotions": "T038",
  "/admin/v1/promotions/{id}/codes": "T038",
  "/admin/v1/promotions/{id}/customers": "T038",
  "/admin/v1/shops/{shopId}/audit": "T041",
  "/inventory/v1/admin/shops/{shopId}/low-stock": "T047",
  "/inventory/v1/low-stock": "T047",
  "/fleet/v1/drivers": "T033",
  "/fleet/v1/vehicles": "T034",
  "/orders/v1/customers": "T039",
  "/orders/v1/customers/{customerId}/points/history": "T040",
  "/admin/v1/feedback": "T035",
  "/admin/v1/deliverability": "T036",
  "/admin/v1/delivery/coverage": "T037",
  "/orders/v1/handovers": "T045",
  "/fleet/v1/exceptions": "T046",
  "/shop/v1/orders": "T042",
  "/shop/v1/products": "T043",
  "/shop/v1/availability": "T044",
};

/** Files that still build their own ORDER BY from a variable, with the task that removes it. */
export const PENDING_ORDER_BY: Readonly<Record<string, string>> = {
  "catalog/src/products/repository.ts": "T028",
  "shop/src/products/repository.ts": "T043",
  "shop/src/orders/repository.ts": "T042",
};

/** Fixed caps of 200+ rows that are NOT console lists (research R14), and the console caps still to remove. */
export const ALLOWED_LIMITS: Readonly<Record<string, string>> = {
  "driver/src/work/delivery.ts": "driver app work, not a console list (R14)",
  "catalog/src/products/repository.ts": "a product's staff history on its own page, bounded by the product",
  "inventory/src/stock/repository.ts": "pending T047",
  "orders/src/orders/repository.ts": "pending T045",
  "fleet/src/exceptions/sql.ts": "pending T046",
};

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) out.push(p);
  }
  return out;
}

const SERVICE_SOURCES = readdirSync(EDGE_API_DIR)
  .filter((d) => d !== "node_modules" && statSync(resolve(EDGE_API_DIR, d)).isDirectory())
  .flatMap((d) => {
    try {
      return sourceFiles(resolve(EDGE_API_DIR, d, "src"));
    } catch {
      return [];
    }
  })
  .map((abs) => ({ rel: relative(EDGE_API_DIR, abs), text: readFileSync(abs, "utf8") }));

/** The GET handler file of a route, found through the stacks (never a hard-coded path). */
function handlerFileOf(path: string): string {
  for (const stack of listStacks()) {
    for (const fn of functionsOf(stack)) {
      if (fn.routes.some((r) => r.path === path && r.method.toUpperCase() === "GET")) {
        return `${stack.dir}/${fn.handler.replace(/\.[A-Za-z]+$/, "")}.ts`;
      }
    }
  }
  throw new Error(`no GET route ${path} in any stack`);
}

describe("console lists go through parseListQuery (103)", () => {
  it.each(LIST_ROUTES.filter((p) => !PENDING_LIST_ROUTES[p]))("%s parses its request with parseListQuery", (path) => {
    const file = handlerFileOf(path);
    const text = readFileSync(resolve(EDGE_API_DIR, file), "utf8");
    // The handler, or the service it calls, uses the helper; the handler is where the query string is read.
    expect(text, `${file} must call parseListQuery`).toMatch(/\bparseListQuery\(/);
  });

  it("every pending list names a route that exists", () => {
    for (const p of Object.keys(PENDING_LIST_ROUTES)) {
      expect(LIST_ROUTES as readonly string[]).toContain(p);
      expect(() => handlerFileOf(p)).not.toThrow();
    }
  });

  it("no source splices a variable into ORDER BY except the helper and the pending files", () => {
    const offenders = SERVICE_SOURCES.filter(
      (f) => f.rel !== "shared/src/lib/list-query.ts" && !PENDING_ORDER_BY[f.rel] && /ORDER BY \$\{/.test(f.text),
    ).map((f) => f.rel);
    expect(offenders, "use orderBy(spec, req) from list-query.ts").toEqual([]);
  });

  it("no source caps a query at 200 or more rows except the allowed ones", () => {
    const offenders = SERVICE_SOURCES.filter((f) => !ALLOWED_LIMITS[f.rel] && /\bLIMIT\s+([2-9]\d{2}|\d{4,})\b/.test(f.text)).map(
      (f) => f.rel,
    );
    expect(offenders, "page the list (parseListQuery) instead of capping it").toEqual([]);
  });

  it("the allow-lists hold no stale entry", () => {
    for (const rel of [...Object.keys(PENDING_ORDER_BY)]) {
      const f = SERVICE_SOURCES.find((s) => s.rel === rel);
      expect(f && /ORDER BY \$\{/.test(f.text), `${rel} no longer needs its PENDING_ORDER_BY entry`).toBe(true);
    }
    for (const rel of Object.keys(ALLOWED_LIMITS)) {
      const f = SERVICE_SOURCES.find((s) => s.rel === rel);
      expect(f && /\bLIMIT\s+([2-9]\d{2}|\d{4,})\b/.test(f.text), `${rel} no longer needs its ALLOWED_LIMITS entry`).toBe(true);
    }
  });
});
