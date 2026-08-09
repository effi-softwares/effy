import { cache } from "react"

import type { StorefrontHomeDTO } from "@effy/shared-types"

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
