import "server-only"

import { ServerApiClient } from "@effy/api-client"

import { coreApiBaseUrl } from "@/lib/config"

/**
 * The HOT path (`core-api`, Go). THE ROUTING LAW (FR-028):
 *
 *     product · catalog · search · cart · order · payment   →   HERE
 *
 * That is not a preference, it is binding on every later customer slice. Commerce is
 * latency-sensitive customer traffic and belongs on the Go hot path (constitution Principle
 * III). No commerce feature may be placed on the cold path without a recorded exception.
 *
 * ⚠ `core-api` has NO cloud deployment (operator decision, 2026-07-14) — it runs in local
 * Docker (`make core-run`) and its go-live is its own later slice. The base address is read
 * from configuration precisely so that slice can repoint this file with an env change and NO
 * code edit (FR-029).
 *
 * CACHING. Reads that are shared across all customers (catalog, prices) should be cached and
 * tag-invalidated; anything per-customer (a cart) must NOT be. Callers express that here:
 *
 *     coreApi().get("/v1/products", cached({ tags: ["catalog"], revalidate: 3600 }))
 *     coreApi(token).get("/v1/cart", uncached())
 *
 * Getting this wrong is not a style error — an uncached read on a public page makes the page
 * dynamic and costs the storefront its CDN, its speed, and its crawlability.
 */
export function coreApi(token?: string | null) {
  return new ServerApiClient({ baseUrl: coreApiBaseUrl(), token })
}

/** A read that is the SAME for every customer → cache it, and name the tag that busts it. */
export function cached(opts: { tags: string[]; revalidate?: number }): RequestInit {
  return {
    next: { tags: opts.tags, revalidate: opts.revalidate },
  } as RequestInit
}

/** A read that is DIFFERENT per customer (cart, orders) → never cache it. */
export function uncached(): RequestInit {
  return { cache: "no-store" }
}
