import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { EDGE_API_DIR, functionsOf, listStacks } from "./serverless-stacks";

/**
 * 103: every console list goes through `parseListQuery` (one way to search, sort, page and count), no list
 * splices its own ORDER BY, and no list stops at a fixed number of rows. The two allow-lists below shrink to
 * empty as the lists are converted; T058 asserts they are empty.
 */

/**
 * Every console list route (contracts/list-contract.md). Method GET. Not here, on purpose: a customer's points
 * history - a keyset ledger the customer app reads too, paged once in `@effy/edge-shared/points` (`history`).
 */
const LIST_ROUTES = [
  "/orders/v1/orders",
  "/catalog/v1/products",
  "/catalog/v1/review",
  "/catalog/v1/products/missing-details",
  "/catalog/v1/review/margin-not-set",
  "/catalog/v1/imports",
  "/admin/v1/promotions",
  "/admin/v1/promotions/{id}/codes",
  "/admin/v1/promotions/{id}/customers",
  "/admin/v1/shops",
  "/inventory/v1/admin/shops/{shopId}/low-stock",
  "/inventory/v1/low-stock",
  "/inventory/v1/variants/{variantId}/stock",
  "/inventory/v1/admin/shops/{shopId}/variants/{variantId}/stock",
  "/fleet/v1/drivers",
  "/fleet/v1/vehicles",
  "/orders/v1/customers",
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
};

/** Files that still build their own ORDER BY from a variable, with the task that removes it. */
export const PENDING_ORDER_BY: Readonly<Record<string, string>> = {
};

/** Fixed caps of 200+ rows that are NOT console lists (research R14), and the console caps still to remove. */
export const ALLOWED_LIMITS: Readonly<Record<string, string>> = {
  "driver/src/work/delivery.ts": "driver app work, not a console list (R14)",
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
  it("103 is done: nothing is left pending (T058)", () => {
    expect(PENDING_LIST_ROUTES).toEqual({});
    expect(PENDING_ORDER_BY).toEqual({});
  });

  it.each(LIST_ROUTES.filter((p) => !PENDING_LIST_ROUTES[p]))("%s parses its request with parseListQuery", (path) => {
    const file = handlerFileOf(path);
    const text = readFileSync(resolve(EDGE_API_DIR, file), "utf8");
    // The handler, or a module it imports from its own service, parses the request with the helper.
    const dir = file.slice(0, file.lastIndexOf("/"));
    const imported = [...text.matchAll(/from "(\.{1,2}\/[^"]+)"/g)].map((m) => resolve(EDGE_API_DIR, dir, `${m[1]}.ts`));
    const texts = [text, ...imported.flatMap((f) => { try { return [readFileSync(f, "utf8")]; } catch { return []; } })];
    expect(texts.some((t) => /\bparseListQuery\(/.test(t)), `${file} (or what it imports) must call parseListQuery`).toBe(true);
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
