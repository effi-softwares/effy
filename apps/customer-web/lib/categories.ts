import { cache } from "react"
import type { StorefrontCategoryDTO } from "@effy/shared-types"

import { edgeApiPublic, uncached } from "@/lib/api/edge"

/**
 * The aisle list, fetched at most ONCE per render however many components ask for it.
 *
 * The header's aisle row, its All aisles menu, the search field's aisle chooser, the phone menu and
 * the home page all read it. React's `cache` makes that one round trip; without it a home render
 * would ask for the same list four times.
 *
 * ⚠ Throws when the catalogue is unreachable. Chrome callers catch and render without aisles — a
 * header must never take the page down with it.
 */
export const getCategories = cache(
  (): Promise<StorefrontCategoryDTO[]> =>
    edgeApiPublic().get<StorefrontCategoryDTO[]>("/storefront/v1/categories", uncached()),
)

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
