/**
 * A listing may be 60 seconds late at most, so `max-age` + `stale-while-revalidate` sum to 60 or less.
 * The product page and a promotion are never cached; `cache.contract.test.ts` holds this to the routes.
 */
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

export const CACHE_SECONDS = {
  listing: { maxAge: 30, staleWhileRevalidate: 30 },
  suggestions: { maxAge: 60 },
} as const satisfies Record<string, { maxAge: number; staleWhileRevalidate?: number }>;

export type CachePolicy = keyof typeof CACHE_SECONDS;

export function cacheControl(policy: CachePolicy): string {
  const { maxAge, staleWhileRevalidate } = CACHE_SECONDS[policy] as { maxAge: number; staleWhileRevalidate?: number };
  return staleWhileRevalidate === undefined
    ? `public, max-age=${maxAge}`
    : `public, max-age=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`;
}

/** Only for a success; a refusal is never kept. */
export function cacheable(
  res: APIGatewayProxyStructuredResultV2,
  policy: CachePolicy,
): APIGatewayProxyStructuredResultV2 {
  return { ...res, headers: { ...res.headers, "cache-control": cacheControl(policy) } };
}
