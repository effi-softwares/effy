import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CACHE_SECONDS, cacheControl, type CachePolicy } from "./lib/cache";

/**
 * ⚠ WHAT A BROWSER MAY KEEP, ROUTE BY ROUTE — the whole list, so a new route has to be put on it.
 *
 * `null` is a decision too: the product page must be current (054 FR-015a), and a promotion is the
 * page a shopper copies its code from, kept live.
 * A route missing from this table fails, which is the point — "nobody thought about it" is how a
 * live claim ends up cached.
 */
const POLICY: Record<string, CachePolicy | null> = {
  "products-v1-get.ts": "listing",
  "facets-v1-get.ts": "listing",
  "suggestions-v1-get.ts": "suggestions",
  "serviceability-v1-get.ts": "serviceability",
  "localities-v1-get.ts": "localities",
  "product-v1-get.ts": null,
  "home-v1-get.ts": "listing",
  "categories-v1-get.ts": "listing",
  "promotion-v1-get.ts": null,
  "healthz-get.ts": null,
  "readyz-get.ts": null,
};

const here = dirname(fileURLToPath(import.meta.url));
const functionsDir = resolve(here, "functions");
const files = readdirSync(functionsDir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
const source = (file: string) => readFileSync(resolve(functionsDir, file), "utf8");

describe("storefront cache headers", () => {
  it("every function has a stated policy, and nothing stated is missing", () => {
    expect([...files].sort()).toEqual(Object.keys(POLICY).sort());
  });

  it.each(Object.entries(POLICY))("%s → %s", (file, policy) => {
    const used = [...source(file).matchAll(/cacheable\([\s\S]*?"([a-z]+)",?\s*\)/g)].map((m) => m[1]);
    if (policy === null) expect(used).toEqual([]);
    else {
      expect(used.length).toBeGreaterThan(0);
      expect(new Set(used)).toEqual(new Set([policy]));
    }
  });

  it.each(files)("%s writes no cache header of its own", (file) => {
    expect(source(file)).not.toMatch(/cache-control/i);
  });

  it("a listing is never shown more than 60 seconds late (054 FR-015a)", () => {
    const { maxAge, staleWhileRevalidate } = CACHE_SECONDS.listing;
    expect(maxAge + staleWhileRevalidate).toBeLessThanOrEqual(60);
  });

  it("says the header the way a browser reads it", () => {
    expect(cacheControl("listing")).toBe("public, max-age=30, stale-while-revalidate=30");
    expect(cacheControl("serviceability")).toBe("public, max-age=300");
  });
});
