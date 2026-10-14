/**
 * The only lifetimes a cached storefront read may take (PERF-05..07, 054 FR-015a as amended).
 * `lib/storefront-freshness.guard.test.ts` holds every `"use cache"` to one of these, and these to
 * FR-015a.
 *
 * ⚠ THE OLDEST ANSWER A SHOPPER CAN SEE IS `expire` + `stale`, not `revalidate`: the server keeps
 * serving an entry until `expire` (refreshing it behind the request once it is `revalidate` old), and
 * the browser's router keeps what it was given for `stale` (never under 30s). So `listing` is 30 + 30 —
 * FR-015a's 60 seconds. An `expire` under five minutes also keeps a read out of the build's prerender.
 *
 * ⚠ NO TAG IS EVER REVALIDATED, ON PURPOSE. Each server instance keeps its own cache in memory, so a
 * revalidate call would reach the one instance that took it. The lifetimes are the whole contract.
 *
 * Objects rather than named profiles in next.config.ts: a named profile is typed only by the types
 * `next build` generates, so `tsc` refuses it on a clean checkout.
 */
export const CACHE_LIFE = {
  /** Stock-derived reads: the aisle list (its counts), the home rails and banners. FR-015a's tier. */
  listing: { stale: 30, revalidate: 15, expire: 30 },
  /**
   * A product's words and pictures — never its price or availability, which are read live beside it.
   * A staff edit shows within 20 minutes at the outside.
   */
  catalogue: { stale: 300, revalidate: 300, expire: 900 },
} as const satisfies Record<string, { stale: number; revalidate: number; expire: number }>
