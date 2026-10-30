"use client"

import { useEffect, useRef, useState } from "react"

import type { ProductSearchResultDTO, StorefrontProductCardDTO } from "@effy/shared-types"

import { edgeApiBaseUrl } from "@/lib/config"
import { getRecentlyViewedIds } from "@/lib/recently-viewed"

import { ProductRail } from "./ProductRail"

/**
 * The "Recently viewed" rail - device-local, so it is a client island (not part of the cached shell).
 * It reads the ids from localStorage, hydrates them to cards via the public storefront endpoint, and
 * preserves most-recent-first order (the server returns them re-ordered to the id list).
 *
 * It asks only when the shopper is about to see it. The rail is the last thing on the home
 * page; reading it on load put a cross-origin request in the way of everything above it, for a rail
 * most visits never scroll to. An empty marker waits 600px below the viewport and the read starts as
 * it nears. No viewed products → no marker, no request.
 */
export function RecentlyViewedRail() {
  const [ids, setIds] = useState<string[]>([])
  const [near, setNear] = useState(false)
  const [products, setProducts] = useState<StorefrontProductCardDTO[]>([])
  const marker = useRef<HTMLDivElement>(null)

  // localStorage exists only in the browser, so the ids are read after mount.
  useEffect(() => setIds(getRecentlyViewedIds()), [])

  useEffect(() => {
    const el = marker.current
    if (!el || near) return
    const obs = new IntersectionObserver((entries) => entries[0]?.isIntersecting && setNear(true), {
      rootMargin: "600px",
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [ids, near])

  useEffect(() => {
    if (!near || ids.length === 0) return
    const controller = new AbortController()
    const url = `${edgeApiBaseUrl()}/storefront/v1/products?ids=${encodeURIComponent(ids.join(","))}`
    fetch(url, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<ProductSearchResultDTO>) : null))
      .then((data) => {
        if (data) setProducts(data.items)
      })
      .catch(() => {
        /* best-effort; a failed hydrate simply hides the rail */
      })
    return () => controller.abort()
  }, [near, ids])

  if (products.length > 0) return <ProductRail title="Recently viewed" products={products} />
  if (ids.length === 0 || near) return null
  return <div ref={marker} aria-hidden="true" />
}
