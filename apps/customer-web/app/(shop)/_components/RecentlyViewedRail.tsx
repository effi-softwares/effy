"use client"

import { useEffect, useState } from "react"

import type { ProductSearchResultDTO, StorefrontProductCardDTO } from "@effy/shared-types"

import { coreApiBaseUrl } from "@/lib/config"
import { getRecentlyViewedIds } from "@/lib/recently-viewed"

import { ProductRail } from "./ProductRail"

/**
 * The "Recently viewed" rail — device-local, so it is a client island (not part of the cached shell).
 * It reads the ids from localStorage, hydrates them to cards via the public storefront endpoint, and
 * preserves most-recent-first order (the server returns them re-ordered to the id list).
 */
export function RecentlyViewedRail() {
  const [products, setProducts] = useState<StorefrontProductCardDTO[]>([])

  useEffect(() => {
    const ids = getRecentlyViewedIds()
    if (ids.length === 0) return
    const controller = new AbortController()
    const url = `${coreApiBaseUrl()}/v1/storefront/products?ids=${encodeURIComponent(ids.join(","))}`
    fetch(url, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<ProductSearchResultDTO>) : null))
      .then((data) => {
        if (data) setProducts(data.items)
      })
      .catch(() => {
        /* best-effort; a failed hydrate simply hides the rail */
      })
    return () => controller.abort()
  }, [])

  if (products.length === 0) return null
  return <ProductRail title="Recently viewed" products={products} />
}
