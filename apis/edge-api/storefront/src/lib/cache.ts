/**
 * How long a browser may keep each public storefront answer — every value, in one place.
 *
 * ⚠ A LISTING MAY BE 60 SECONDS LATE AND NO MORE (054 FR-015a). `max-age` + `stale-while-revalidate`
 * is the oldest answer a browser will show, so the two must SUM to 60 or less: 30 + 30, not 30 + 60.
 * The aisle list (its counts) and the home payload (its rails and banners) are listings too (PERF-05/06).
 * The product page and a promotion are absent on purpose — the first must be current, and the second
 * is the page a shopper copies a code from; `cache.contract.test.ts` holds this list to the routes.
 */
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

export const CACHE_SECONDS = {
  /** Search, aisle and rail listings, the aisle list, the home payload; also the recently-viewed hydration. */
  listing: { maxAge: 30, staleWhileRevalidate: 30 },
  /** The same few characters are typed by many shoppers. */
  suggestions: { maxAge: 60 },
} as const satisfies Record<string, { maxAge: number; staleWhileRevalidate?: number }>;

export type CachePolicy = keyof typeof CACHE_SECONDS;

export function cacheControl(policy: CachePolicy): string {
  const { maxAge, staleWhileRevalidate } = CACHE_SECONDS[policy] as { maxAge: number; staleWhileRevalidate?: number };
  return staleWhileRevalidate === undefined
    ? `public, max-age=${maxAge}`
    : `public, max-age=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`;
}

/** The answer, publicly cacheable under `policy`. Only for a success — a refusal is never kept. */
export function cacheable(
  res: APIGatewayProxyStructuredResultV2,
  policy: CachePolicy,
): APIGatewayProxyStructuredResultV2 {
  return { ...res, headers: { ...res.headers, "cache-control": cacheControl(policy) } };
}
