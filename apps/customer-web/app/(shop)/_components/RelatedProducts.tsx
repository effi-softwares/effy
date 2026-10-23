import type { ProductSearchResultDTO } from "@effy/shared-types"

import { edgeApiPublic, uncached } from "@/lib/api/edge"

import { ProductRail } from "./ProductRail"

/**
 * "More like this": the product search filtered by the product's own category (the only relatedness the
 * catalogue models). In its own <Suspense>, so it never delays the buy box; omitted when there is
 * nothing else.
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
    result = await edgeApiPublic().get<ProductSearchResultDTO>(
      `/storefront/v1/products?categoryKey=${encodeURIComponent(categoryKey)}&limit=12`,
      uncached(),
    )
  } catch {
    return null // a failed sidebar must never break the product page
  }

  const products = result.items.filter((p) => p.id !== excludeProductId)
  if (products.length === 0) return null

  return <ProductRail title="You might also like" products={products} className="px-0!" />
}

/** "More from {brand}" (reference: Product detail). Absent when the brand has nothing else on the shelf. */
export async function MoreFromBrand({ brand, excludeProductId }: { brand: string; excludeProductId: string }) {
  let result: ProductSearchResultDTO
  try {
    result = await edgeApiPublic().get<ProductSearchResultDTO>(
      `/storefront/v1/products?brand=${encodeURIComponent(brand)}&limit=12`,
      uncached(),
    )
  } catch {
    return null
  }

  const products = result.items.filter((p) => p.id !== excludeProductId)
  if (products.length === 0) return null

  return (
    <ProductRail
      title={`More from ${brand}`}
      products={products}
      href={`/search?brand=${encodeURIComponent(brand)}`}
      className="px-0!"
    />
  )
}
