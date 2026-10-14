import { cacheLife, cacheTag } from "next/cache"
import { connection } from "next/server"
import { cache } from "react"

import type { StorefrontHomeDTO } from "@effy/shared-types"

import { edgeApiPublic } from "@/lib/api/edge"
import { CACHE_LIFE } from "@/lib/cache-life"

/**
 * The home payload — SHARED between requests for up to 60 seconds (PERF-06, 054 FR-015a as amended).
 *
 * It is ~8 queries per read, and not only the home page asks: the header's offers menu (`AisleRow`)
 * and `/offers` read its banners, so read live it cost a backend round trip on every page view.
 *
 * ⚠ `listing`, NOT LONGER: the rails carry availability, and the banners say "this offer is still
 * available" — a claim another shopper can falsify by redeeming it (029). Both are held to FR-015a's
 * listing tier. The cart and the payment re-check a code when they apply it, so a banner at most a
 * minute old sends nobody to pay for an offer that has ended. `/promotions/[id]` — the page a banner
 * leads to, where the shopper copies the code — stays live.
 * ⚠ No writer revalidates the tags (lib/cache-life.ts says why); the lifetime is the contract.
 */
async function readHome(): Promise<StorefrontHomeDTO> {
  "use cache"
  cacheLife(CACHE_LIFE.listing)
  cacheTag("home", "promotions")
  return edgeApiPublic().get<StorefrontHomeDTO>("/storefront/v1/home")
}

/**
 * The home payload, asked for at most ONCE per render however many components want it.
 *
 * ⚠ IT EXISTS BECAUSE TWO SUSPENSE BOUNDARIES NEED THE SAME DATA. The promotions hero renders at the
 * top of the page in its own boundary, so it can arrive without waiting on the category read; the
 * merchandised sections render in another. React's `cache()` makes the dedupe explicit — one lookup
 * per render by construction, rather than by two call sites happening to match.
 */
export const getHome = cache(async (): Promise<StorefrontHomeDTO> => {
  await connection() // request time only — see `atRequestTime` in lib/cache-life.ts
  return readHome()
})
