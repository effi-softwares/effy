import { cacheLife, cacheTag } from "next/cache"
import { connection } from "next/server"
import { cache } from "react"
import type { StorefrontCategoryDTO } from "@effy/shared-types"

import { edgeApiPublic } from "@/lib/api/edge"
import { CACHE_LIFE } from "@/lib/cache-life"

/**
 * The aisle list — SHARED between requests for up to 60 seconds (PERF-05, 054 FR-015a as amended).
 *
 * Every page's header reads it (aisle row, All aisles menu, search chooser, phone menu), so read live
 * it was a backend round trip — two correlated subqueries per category — on every page view, for a
 * list that changes when staff edit the taxonomy.
 *
 * ⚠ `listing`, NOT LONGER: each aisle carries `productCount`, which is stock-derived and decides which
 * aisles the home page shows. That is FR-015a's listing tier — 60 seconds late and no more.
 * ⚠ No writer revalidates the tag (lib/cache-life.ts says why); the lifetime is the contract.
 */
async function readCategories(): Promise<StorefrontCategoryDTO[]> {
  "use cache"
  cacheLife(CACHE_LIFE.listing)
  cacheTag("categories")
  return edgeApiPublic().get<StorefrontCategoryDTO[]>("/storefront/v1/categories")
}

/**
 * The aisle list, asked for at most ONCE per render however many components want it — React's
 * `cache` collapses the header's four readers and the home page into one lookup.
 *
 * ⚠ Throws when the catalogue is unreachable (a failure is never kept). Chrome callers catch and
 * render without aisles — a header must never take the page down with it.
 */
export const getCategories = cache(async (): Promise<StorefrontCategoryDTO[]> => {
  await connection() // request time only — see `atRequestTime` in lib/cache-life.ts
  return readCategories()
})

export async function getCategoriesSafe(): Promise<StorefrontCategoryDTO[]> {
  try {
    return await getCategories()
  } catch {
    return []
  }
}

export function topLevel(categories: readonly StorefrontCategoryDTO[]): StorefrontCategoryDTO[] {
  return categories.filter((c) => c.parentKey === null)
}

export function childrenOf(
  categories: readonly StorefrontCategoryDTO[],
  key: string,
): StorefrontCategoryDTO[] {
  return categories.filter((c) => c.parentKey === key)
}

export function aisleHref(key: string): string {
  return `/search?category=${encodeURIComponent(key)}`
}
