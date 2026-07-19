"use client"

import { Search, X } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

import type { ProductSearchResultDTO, StorefrontProductCardDTO } from "@effy/shared-types"

import { coreApiBaseUrl } from "@/lib/config"

import { ProductCard } from "./ProductCard"

/**
 * Search (US4). A client experience: type a query, results load via INFINITE SCROLL (keyset cursor),
 * refine with filter chips. Facets are QUERY PARAMS (never path segments) so discovery stays cacheable
 * (FR-017). Reads the initial query/category from the URL (client-side, so `/search` stays a static
 * shell) and fetches the PUBLIC storefront endpoint directly (no auth).
 */
export function SearchExperience() {
  const params = useSearchParams()
  const [query, setQuery] = useState(params.get("q") ?? "")
  const [saleOnly, setSaleOnly] = useState(false)
  const [items, setItems] = useState<StorefrontProductCardDTO[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [exhausted, setExhausted] = useState(false)
  const category = params.get("category")

  // Build the request URL for a page (cursor null = first page).
  const urlFor = useCallback(
    (next: string | null) => {
      const p = new URLSearchParams()
      if (query.trim()) p.set("q", query.trim())
      if (category) p.set("categoryKey", category)
      if (saleOnly) p.set("saleOnly", "true")
      if (next) p.set("cursor", next)
      p.set("limit", "24")
      return `${coreApiBaseUrl()}/v1/storefront/products?${p.toString()}`
    },
    [query, category, saleOnly],
  )

  // Reset + load the first page whenever the query or filters change (debounced).
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setExhausted(false)
    const t = setTimeout(() => {
      fetch(urlFor(null), { signal: controller.signal })
        .then((r) => (r.ok ? (r.json() as Promise<ProductSearchResultDTO>) : null))
        .then((data) => {
          if (!data) return
          setItems(data.items)
          setCursor(data.nextCursor)
          setExhausted(data.nextCursor === null)
        })
        .catch(() => {})
        .finally(() => setLoading(false))
    }, 250)
    return () => {
      controller.abort()
      clearTimeout(t)
    }
  }, [urlFor])

  // Append the next page.
  const loadMore = useCallback(() => {
    if (!cursor || loading) return
    setLoading(true)
    fetch(urlFor(cursor))
      .then((r) => (r.ok ? (r.json() as Promise<ProductSearchResultDTO>) : null))
      .then((data) => {
        if (!data) return
        setItems((prev) => [...prev, ...data.items])
        setCursor(data.nextCursor)
        setExhausted(data.nextCursor === null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [cursor, loading, urlFor])

  // Infinite scroll: observe a sentinel at the end of the list.
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore()
      },
      { rootMargin: "400px" },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [loadMore])

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search groceries, brands and more…"
          className="h-11 w-full rounded-full border pl-10 pr-4 text-sm"
          aria-label="Search products"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <FilterChip active={saleOnly} onClick={() => setSaleOnly((s) => !s)}>
          On sale
        </FilterChip>
        {category && (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-sm">
            {category}
          </span>
        )}
      </div>

      {items.length === 0 && !loading ? (
        <div className="mt-16 text-center text-muted-foreground">
          {query.trim() ? `No results for “${query.trim()}”. Try a different search.` : "Start typing to search."}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="h-10" aria-hidden="true" />
      {loading && <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>}
      {exhausted && items.length > 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">That’s everything.</p>
      )}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${
        active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
      }`}
      aria-pressed={active}
    >
      {children}
      {active && <X className="size-3" />}
    </button>
  )
}
