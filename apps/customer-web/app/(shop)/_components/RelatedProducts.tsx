import type { ProductSearchResultDTO } from "@effy/shared-types"

import { coreApi, uncached } from "@/lib/api/core"

import { ProductRail } from "./ProductRail"

/**
 * "More like this" (025 US2 / FR-026).
 *
 * ⚠ No recommendation engine and no new relationship — it reuses the existing product search filtered
 * by the product's own category, which is what the spec's assumptions permit. A category is the only
 * relatedness the catalogue actually models; inventing more would be a feature pretending to be a
 * layout.
 *
 * ⚠ Rendered inside its OWN <Suspense> boundary by the caller, so a slow related query can never delay
 * the buy box — the part of the page the shopper came for.
 *
 * When the category yields nothing else, the section is omitted entirely rather than rendered empty.
 */
export async function RelatedProducts({
  categoryKey,
  excludeProductId,
}: {
  categoryKey: string
  excludeProductId: string
}) {
  let result: ProductSearchResultDTO
  try {
    result = await coreApi().get<ProductSearchResultDTO>(
      `/v1/storefront/products?categoryKey=${encodeURIComponent(categoryKey)}&limit=12`,
      uncached(),
    )
  } catch {
    return null // a failed sidebar must never break the product page
  }

  const products = result.items.filter((p) => p.id !== excludeProductId)
  if (products.length === 0) return null

  return <ProductRail title="You might also like" products={products} className="!px-0" />
}
