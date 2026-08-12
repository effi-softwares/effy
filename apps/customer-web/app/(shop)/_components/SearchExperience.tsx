"use client"

import dynamic from "next/dynamic"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { FacetSetDTO, ProductSearchResultDTO, ProductSort, StorefrontProductCardDTO } from "@effy/shared-types"

import { ActionButton } from "@/components/storefront/actions"
import { coreApiBaseUrl } from "@/lib/config"

import { ProductCard, productGridNarrow } from "./ProductCard"
import type { SelectedFilters } from "./filters/FilterControls"

/**
 * Search and refinement (019 US4, 025 US1, advanced filters 043).
 *
 * ── The URL IS the refinement state (FR-015/FR-017) ──────────────────────────────────────────────
 * Every facet lives in the URL so a refined search can be shared, bookmarked and restored: `q`,
 * `categoryKey`, `saleOnly`, `minPrice`/`maxPrice`, `sort`, plus (043) repeated `brand` and
 * `attr.<key>` params (OR within a facet, AND across). Reading params client-side keeps /search a
 * static shell.
 *
 * ── Bundle (043) ─────────────────────────────────────────────────────────────────────────────────
 * The filter controls are `next/dynamic` — /search sits ~2 KB under the 174 KB guest budget, so the
 * facet UI must NOT enter the first-load chunk. The mobile sheet chrome is a tiny inline overlay
 * (native, no vaul) for the same reason.
 */

const FilterControls = dynamic(() => import("./filters/FilterControls"), {
  ssr: false,
  loading: () => <p className="text-sm text-muted-foreground">Loading filters…</p>,
})

const SORT_LABELS: Record<ProductSort, string> = {
  relevance: "Best match",
  newest: "Newest",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
}

const PAGE_SIZE = 24

export function SearchExperience() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  // ── Refinement state, read from the URL ───────────────────────────────────────────────────────
  const q = params.get("q") ?? ""
  const category = params.get("category")
  const saleOnly = params.get("saleOnly") === "true"
  const minPrice = params.get("minPrice") ?? ""
  const maxPrice = params.get("maxPrice") ?? ""
  const sort = (params.get("sort") as ProductSort | null) ?? "newest"
  const brands = useMemo(() => params.getAll("brand"), [params])
  // Attribute facets: every `attr.<key>` param, collapsed to key → values[].
  const attributes = useMemo(() => {
    const out: Record<string, string[]> = {}
    for (const [key, value] of params.entries()) {
      if (key.startsWith("attr.") && value) {
        const k = key.slice("attr.".length)
        ;(out[k] ??= []).push(value)
      }
    }
    return out
  }, [params])

  const [items, setItems] = useState<StorefrontProductCardDTO[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [appliedSort, setAppliedSort] = useState<ProductSort>(sort)
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [exhausted, setExhausted] = useState(false)

  const [facetSet, setFacetSet] = useState<FacetSetDTO | null>(null)
  const [facetsLoading, setFacetsLoading] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  /** Rewrite the URL. Values may be a string, null (remove), or string[] (repeated param). */
  const setParam = useCallback(
    (patch: Record<string, string | string[] | null>) => {
      const next = new URLSearchParams(params.toString())
      for (const [key, value] of Object.entries(patch)) {
        next.delete(key)
        if (Array.isArray(value)) for (const v of value) next.append(key, v)
        else if (value !== null && value !== "") next.set(key, value)
      }
      // The cursor is NEVER URL state — a shared link opens at the first page (FR-015).
      const query = next.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [params, pathname, router],
  )

  /** Toggle one value of a repeated facet param (OR within). */
  const toggleParamValue = useCallback(
    (paramKey: string, value: string) => {
      const current = params.getAll(paramKey)
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
      setParam({ [paramKey]: next })
    },
    [params, setParam],
  )

  /** All active filters, and how many — drives the mobile trigger badge (FR-014). */
  const activeCount =
    (category ? 1 : 0) +
    (saleOnly ? 1 : 0) +
    (minPrice || maxPrice ? 1 : 0) +
    brands.length +
    Object.values(attributes).reduce((n, vals) => n + vals.length, 0)

  const clearAllFilters = useCallback(() => {
    const next = new URLSearchParams()
    if (q.trim()) next.set("q", q.trim())
    if (sort !== "newest") next.set("sort", sort)
    const query = next.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [q, sort, pathname, router])

  const selected: SelectedFilters = useMemo(
    () => ({ category, brands, attributes, saleOnly }),
    [category, brands, attributes, saleOnly],
  )

  // value → label lookup per facet, so a chip reads "Vegan", not "vegan" (FR-012). A selected value is
  // always present in its facet (own-selection is excluded from that facet's counts), so it resolves.
  const facetLabel = useMemo(() => {
    const m: Record<string, Record<string, string>> = {}
    for (const f of facetSet?.facets ?? []) m[f.key] = Object.fromEntries(f.options.map((o) => [o.value, o.label]))
    return m
  }, [facetSet])

  /** Every applied filter as an individually removable chip (FR-012). */
  const chips = useMemo(() => {
    const out: { key: string; label: string; remove: () => void }[] = []
    if (category)
      out.push({ key: "cat", label: facetLabel.category?.[category] ?? category, remove: () => setParam({ category: null }) })
    for (const b of brands) out.push({ key: `brand:${b}`, label: b, remove: () => toggleParamValue("brand", b) })
    for (const [k, vals] of Object.entries(attributes))
      for (const v of vals)
        out.push({ key: `attr:${k}:${v}`, label: facetLabel[k]?.[v] ?? v, remove: () => toggleParamValue(`attr.${k}`, v) })
    if (saleOnly) out.push({ key: "sale", label: "On sale", remove: () => setParam({ saleOnly: null }) })
    if (minPrice || maxPrice) {
      const label = minPrice && maxPrice ? `$${minPrice}–$${maxPrice}` : minPrice ? `From $${minPrice}` : `Up to $${maxPrice}`
      out.push({ key: "price", label, remove: () => setParam({ minPrice: null, maxPrice: null }) })
    }
    return out
  }, [category, brands, attributes, saleOnly, minPrice, maxPrice, facetLabel, setParam, toggleParamValue])

  // ── Request builders ──────────────────────────────────────────────────────────────────────────
  const filterParams = useCallback(() => {
    const p = new URLSearchParams()
    if (q.trim()) p.set("q", q.trim())
    if (category) p.set("categoryKey", category)
    if (saleOnly) p.set("saleOnly", "true")
    if (minPrice) p.set("minPrice", minPrice)
    if (maxPrice) p.set("maxPrice", maxPrice)
    for (const b of brands) p.append("brand", b)
    for (const [key, vals] of Object.entries(attributes)) for (const v of vals) p.append(`attr.${key}`, v)
    return p
  }, [q, category, saleOnly, minPrice, maxPrice, brands, attributes])

  const requestUrl = useCallback(
    (next: string | null) => {
      const p = filterParams()
      p.set("sort", sort)
      if (next) p.set("cursor", next)
      p.set("limit", String(PAGE_SIZE))
      return `${coreApiBaseUrl()}/v1/storefront/products?${p.toString()}`
    },
    [filterParams, sort],
  )

  const facetsUrl = useMemo(
    () => `${coreApiBaseUrl()}/v1/storefront/facets?${filterParams().toString()}`,
    [filterParams],
  )

  // Reload from the first page whenever ANY refinement changes (FR-016b: a cursor is sort/filter
  // specific, so restarting is required, not merely convenient). Debounced so a burst of ticks
  // becomes ONE refresh (FR-025/SC-007).
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setFailed(false)
    setExhausted(false)
    const timer = setTimeout(() => {
      fetch(requestUrl(null), { signal: controller.signal })
        .then((r) => (r.ok ? (r.json() as Promise<ProductSearchResultDTO>) : Promise.reject(r.status)))
        .then((data) => {
          setItems(data.items)
          setTotal(data.total)
          setAppliedSort(data.sort)
          setCursor(data.nextCursor)
          setExhausted(data.nextCursor === null)
        })
        .catch((err) => {
          if (err?.name === "AbortError") return
          setFailed(true)
          setItems([])
          setTotal(null)
        })
        .finally(() => setLoading(false))
    }, 250)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [requestUrl])

  // Facets recompute on filter change (NOT on paginate — loadMore never touches this). Debounced with
  // the same rhythm so rapid ticking makes one facets refresh.
  useEffect(() => {
    const controller = new AbortController()
    setFacetsLoading(true)
    const timer = setTimeout(() => {
      fetch(facetsUrl, { signal: controller.signal })
        .then((r) => (r.ok ? (r.json() as Promise<FacetSetDTO>) : Promise.reject(r.status)))
        .then((data) => setFacetSet(data))
        .catch((err) => {
          if (err?.name !== "AbortError") setFacetSet(null)
        })
        .finally(() => setFacetsLoading(false))
    }, 250)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [facetsUrl])

  const loadMore = useCallback(() => {
    if (!cursor || loading) return
    setLoading(true)
    fetch(requestUrl(cursor))
      .then((r) => (r.ok ? (r.json() as Promise<ProductSearchResultDTO>) : Promise.reject(r.status)))
      .then((data) => {
        setItems((prev) => [...prev, ...data.items])
        setCursor(data.nextCursor)
        setExhausted(data.nextCursor === null)
      })
      .catch(() => setExhausted(true))
      .finally(() => setLoading(false))
  }, [cursor, loading, requestUrl])

  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver((entries) => entries[0].isIntersecting && loadMore(), {
      rootMargin: "400px",
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [loadMore])

  const controls = (
    <FilterControls
      facetSet={facetSet}
      loading={facetsLoading}
      selected={selected}
      priceMin={minPrice}
      priceMax={maxPrice}
      onCategory={(value) => setParam({ category: value })}
      onToggleValue={(facetKey, value) =>
        toggleParamValue(facetKey === "brand" ? "brand" : `attr.${facetKey}`, value)
      }
      onToggleSale={() => setParam({ saleOnly: saleOnly ? null : "true" })}
      onApplyPrice={(lo, hi) => setParam({ minPrice: lo || null, maxPrice: hi || null })}
      onClearAll={clearAllFilters}
      activeCount={activeCount}
    />
  )

  return (
    <div className="container py-6">
      <div className="mt-2 grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
        {/* Desktop: a persistent filter side panel (FR-019). It pins to the viewport and scrolls
            INDEPENDENTLY of the results — the heading stays put while a long facet list scrolls inside
            the column, and the product grid scrolls the page as normal. Below lg it is hidden — the
            sheet takes over. */}
        <aside className="hidden rounded-2xl border lg:sticky lg:top-24 lg:flex lg:max-h-[calc(100vh-7rem)] lg:flex-col lg:overflow-hidden">
          <h2 className="border-b px-5 py-4 text-lg font-bold">Filters</h2>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">{controls}</div>
        </aside>

        <div className="min-w-0">
          {/* Below lg: a Filters button (with the applied-count badge) opens the sheet (FR-018/FR-019). */}
          <div className="mb-3 lg:hidden">
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium hover:bg-accent"
            >
              Filters
              {activeCount > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                  {activeCount}
                </span>
              )}
            </button>
          </div>

          {/* Active filters, each individually removable (FR-012). */}
          {chips.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {chips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.remove}
                  className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary px-3 py-1 text-sm text-primary-foreground"
                  aria-label={`Remove filter: ${chip.label}`}
                >
                  {chip.label}
                  <span aria-hidden="true" className="text-xs leading-none">
                    &times;
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Result count + sort (025 FR-016). */}
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3 border-b pb-3">
            <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
              {total === null ? (loading ? "Searching…" : "") : `${total.toLocaleString()} ${total === 1 ? "result" : "results"}`}
            </p>

            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Sort</span>
              <select
                value={appliedSort}
                onChange={(e) => {
                  const next = e.target.value as ProductSort
                  setParam({ sort: next === "newest" ? null : next })
                  void import("@/lib/telemetry").then(({ capture }) => capture({ name: "search_sorted", props: { sort: next } }))
                }}
                className="h-9 rounded-full border bg-card px-3 text-sm"
              >
                {q.trim() && <option value="relevance">{SORT_LABELS.relevance}</option>}
                <option value="newest">{SORT_LABELS.newest}</option>
                <option value="price_asc">{SORT_LABELS.price_asc}</option>
                <option value="price_desc">{SORT_LABELS.price_desc}</option>
              </select>
            </label>
          </div>

          {/* Results */}
          {failed ? (
            <ResultState
              title="We couldn’t load results just now"
              body="Please try again in a moment."
              action={{ label: "Try again", onClick: () => setParam({}) }}
            />
          ) : items.length === 0 && !loading ? (
            <ResultState
              title={q.trim() ? `No results for “${q.trim()}”` : "Start typing to search"}
              body={activeCount > 0 ? "Your filters may be too narrow — try removing one." : "Or browse the store by category."}
              action={
                activeCount > 0
                  ? { label: "Clear all filters", onClick: clearAllFilters }
                  : { label: "Browse categories", href: "/" }
              }
            />
          ) : (
            <div className={`mt-6 ${productGridNarrow}`}>
              {items.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}

          <div ref={sentinelRef} className="h-10" aria-hidden="true" />
          {loading && <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>}
          {exhausted && items.length > 0 && <p className="py-4 text-center text-sm text-muted-foreground">That’s everything.</p>}
        </div>
      </div>

      {/* Mobile/tablet filter sheet — a lightweight slide-up overlay (bundle: no vaul). */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-card p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Filters</h2>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="text-sm text-muted-foreground underline underline-offset-2"
              >
                Close
              </button>
            </div>
            {controls}
            <ActionButton type="button" onClick={() => setSheetOpen(false)} size="md" className="mt-5 w-full">
              Show {total ?? ""} results
            </ActionButton>
          </div>
        </div>
      )}
    </div>
  )
}

function ResultState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: { label: string; onClick?: () => void; href?: string }
}) {
  return (
    <div className="mt-12 rounded-lg border border-dashed p-10 text-center">
      <h2 className="text-base font-medium">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">{body}</p>
      {action &&
        (action.href ? (
          <a href={action.href} className="mt-4 inline-flex h-10 items-center rounded-full border px-5 text-sm hover:bg-accent">
            {action.label}
          </a>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            className="mt-4 inline-flex h-10 items-center rounded-full border px-5 text-sm hover:bg-accent"
          >
            {action.label}
          </button>
        ))}
    </div>
  )
}
