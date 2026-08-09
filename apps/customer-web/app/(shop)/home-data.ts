import { unstable_cacheLife as cacheLife, unstable_cacheTag as cacheTag } from "next/cache"
import { cache } from "react"

import type { PublishedLayoutDTO, StorefrontHomeDTO } from "@effy/shared-types"

import { HOME_LAYOUT_TAG } from "@/lib/cache-tags"

import { coreApi, uncached } from "@/lib/api/core"

/**
 * The home payload, fetched at most ONCE per render however many components ask for it.
 *
 * ⚠ IT EXISTS BECAUSE TWO SUSPENSE BOUNDARIES NOW NEED THE SAME DATA. The promotions hero renders at
 * the top of the page in its own boundary, so it can arrive without waiting on the category read;
 * the merchandised sections render in another. Both are built from `/v1/storefront/home`.
 *
 * Next's request memoization would probably collapse those into one call — identical URL, identical
 * options, same render pass. **"Probably" is not a property to build a second hot-path request on.**
 * It depends on the two call sites keeping byte-identical `RequestInit`, which nothing enforces: add
 * a header at one of them and the storefront quietly starts making two round trips to Sydney per home
 * page view. 029 measured a single RDS round trip from `core-api` at 135 ms and found eight serial
 * queries eating 46% of a 3 s budget — this is the same class of cost, one layer up.
 *
 * React's `cache()` makes the dedupe explicit and greppable instead. One request, by construction.
 *
 * ⚠ `uncached()` is deliberate and unchanged: the payload carries advertised promotions, and "this
 * offer is still available" is a live claim another shopper can falsify (029). `cache()` dedupes
 * WITHIN a render; it does not cache across requests, so that property is untouched.
 */
export const getHome = cache(
  async (): Promise<StorefrontHomeDTO> =>
    coreApi().get<StorefrontHomeDTO>("/v1/storefront/home", uncached()),
)

/**
 * The published page STRUCTURE — which blocks, in what order, with what operator copy (042).
 *
 * ⚠ THIS IS A SEPARATE, CACHED READ FOR ONE REASON: WITHOUT IT THE STOREFRONT STOPS PRERENDERING.
 *
 * Everything above this comment is `uncached()` and correctly so — it is live merchandising. But the
 * moment the page's block ORDER comes out of an uncached read, the entire body sits behind request
 * time and the static shell the public home page is built on is gone. Not degraded: gone. The whole
 * point of `cacheComponents` is that "is this page still cacheable?" is a build error, and this is
 * exactly the change that would trip it.
 *
 * So the structure is fetched from its own endpoint, which carries no products, no presigned URLs and
 * nothing that expires, and is tagged `home-layout`. It changes only when an operator publishes, and
 * publishing invalidates the tag (see `app/api/revalidate/route.ts`). The products keep streaming
 * into their Suspense holes exactly as they do today.
 *
 * ⚠ `"use cache"` IS THE MECHANISM, NOT `next: { tags }` ON THE FETCH. This surface runs with
 * `cacheComponents: true`, under which fetch-level caching is off and `next.tags` on a request does
 * nothing at all. Written the other way this function would look cached, read cached, be *named*
 * cached — and be a plain per-request round trip that quietly made the whole page dynamic. That is
 * the single most expensive way this feature could be wrong, because nothing about it looks wrong.
 *
 * ⚠ `cacheLife` is a SAFETY NET, not the mechanism. The tag is what makes a publish appear within
 * seconds; the expiry is what stops a missed invalidation from being permanent. Relying on the
 * interval alone would mean an operator publishing and seeing nothing change for up to an hour —
 * which is the point at which they publish again, and again, none of which helps.
 */
export async function getHomeLayout(): Promise<PublishedLayoutDTO> {
  "use cache"
  cacheTag(HOME_LAYOUT_TAG)
  cacheLife("hours")
  return coreApi().get<PublishedLayoutDTO>("/v1/storefront/home/layout")
}
