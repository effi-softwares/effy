/**
 * The only lifetimes a cached storefront read may take; `lib/storefront-freshness.guard.test.ts` holds
 * every `"use cache"` to one of them.
 *
 * The oldest answer a shopper can see is `expire` + `stale`: the server serves an entry until `expire`
 * (refreshing it behind the request once `revalidate` old), and the router keeps it for `stale` (never
 * under 30s). So `listing` is 30 + 30 = 60 seconds. An `expire` under five minutes keeps a read out of
 * the prerender.
 *
 * No tag is ever revalidated: each server instance has its own in-memory cache, so a revalidate would
 * reach one instance. The lifetimes are the whole contract.
 *
 * Every cached read's caller awaits `connection` first; otherwise `next build` runs the read while
 * prerendering, and with the backend down (or refusing seven build workers at the shopper role's
 * connection limit) every page under the header fails to build.
 *
 * Objects rather than named profiles: a named profile is typed only by `next build`'s generated types,
 * so `tsc` refuses it on a clean checkout.
 */
export const CACHE_LIFE = {
  /** Stock-derived reads: the aisle list (its counts), the home rails and banners. FR-015a's tier. */
  listing: { stale: 30, revalidate: 15, expire: 30 },
  /**
   * A product's words and pictures - never its price or availability, which are read live beside it.
   * A staff edit shows within 20 minutes at the outside.
   */
  catalogue: { stale: 300, revalidate: 300, expire: 900 },
} as const satisfies Record<string, { stale: number; revalidate: number; expire: number }>
