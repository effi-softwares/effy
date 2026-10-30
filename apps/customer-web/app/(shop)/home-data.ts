import { cacheLife, cacheTag } from "next/cache"
import { connection } from "next/server"
import { cache } from "react"

import type { StorefrontHomeDTO } from "@effy/shared-types"

import { edgeApiPublic } from "@/lib/api/edge"
import { CACHE_LIFE } from "@/lib/cache-life"

/**
 * The home payload, shared between requests for up to 60 seconds (the `listing` tier): about 8 queries,
 * read by the home page, the header's offers menu and `/offers`. Not longer, since it carries
 * availability and "still available" offers; the cart and payment re-check a code when applied, and
 * `/promotions/[id]` stays live. Nothing revalidates the tags (lib/cache-life.ts); the lifetime is the
 * contract.
 */
async function readHome(): Promise<StorefrontHomeDTO> {
  "use cache"
  cacheLife(CACHE_LIFE.listing)
  cacheTag("home", "promotions")
  return edgeApiPublic().get<StorefrontHomeDTO>("/storefront/v1/home")
}

/**
 * The home payload, asked for at most once per render however many components want it.
 *
 * It exists because two suspense boundaries need the same data. The promotions hero renders at the
 * top of the page in its own boundary, so it can arrive without waiting on the category read; the
 * merchandised sections render in another. React's `cache` makes the dedupe explicit - one lookup
 * per render by construction, rather than by two call sites happening to match.
 */
export const getHome = cache(async (): Promise<StorefrontHomeDTO> => {
  await connection() // request time only - see `atRequestTime` in lib/cache-life.ts
  return readHome()
})
