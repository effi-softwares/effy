import { cacheLife, cacheTag } from "next/cache"
import { connection } from "next/server"

import type { PromotionGroupsDTO } from "@effy/shared-types"

import { edgeApiPublic } from "@/lib/api/edge"
import { CACHE_LIFE } from "@/lib/cache-life"

/**
 * Display groups for a signed-out shopper, shared for up to a minute (the listing tier, like the
 * banners they replaced). Kept apart from the personal read so nothing per-customer is ever cached.
 */
async function readCached(keys: string): Promise<PromotionGroupsDTO> {
  "use cache"
  cacheLife(CACHE_LIFE.listing)
  cacheTag("promotions")
  return edgeApiPublic().get<PromotionGroupsDTO>(`/storefront/v1/promotion-groups?keys=${encodeURIComponent(keys)}`)
}

/** Request time only — see `atRequestTime` in lib/cache-life.ts. */
export async function readPublicGroups(keys: string): Promise<PromotionGroupsDTO> {
  await connection()
  return readCached(keys)
}
