"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { FacetSetDTO, ProductSearchResultDTO, ProductSort, StorefrontProductCardDTO } from "@effy/shared-types"

import { ChevronUp, CloudOff, SearchX, SlidersHorizontal, X } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { ActionButton, btnClass, iconBtnClass } from "@/components/storefront/actions"
import { useOnDemand } from "@/lib/use-on-demand"
import { Breadcrumb, type Crumb } from "@/components/ui/misc"
import { edgeApiBaseUrl } from "@/lib/config"

import { ProductCard, productGridNarrow } from "./ProductCard"
import { SaveControl } from "./SaveControl"
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
 * The filter controls are fetched on demand (`useOnDemand`) — /search sits ~2 KB under the 174 KB
 * guest budget, so the facet UI must NOT enter the first-load chunk. The mobile sheet chrome is a tiny inline overlay
 * (native, no vaul) for the same reason.
 */

const loadFilterControls = () => import("./filters/FilterControls").then((m) => m.default)

const SORT_LABELS: Record<ProductSort, string> = {
  relevance: "Best match",
  newest: "Newest",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
}

const PAGE_SIZE = 24

/** What the page needs to NAME a category: its own name and where it sits. */
export interface CategoryName {
  key: string
  name: string
  parentKey: string | null
}

export function SearchExperience({ categories = [] }: { categories?: readonly CategoryName[] }) {
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
  /**
   * The chosen category and the aisles above it, outermost first.
   *
   * ⚠ FROM THE CATEGORY TREE, NOT FROM THE FACET COUNTS. The counts only list categories that have a
   * product filed DIRECTLY in them, and an aisle ("Fruit & veg") holds everything in its sub-aisles
   * and nothing itself — so naming the page from the counts called every such aisle "All products"
   * and labelled its filter chip with the raw key.
   */
  const categoryTrail = useMemo(() => {
    const byKey = new Map(categories.map((c) => [c.key, c]))
    const trail: CategoryName[] = []
    // Bounded: a malformed tree must not be able to loop this.
    for (let c = category ? byKey.get(category) : undefined; c && trail.length < 8; c = c.parentKey ? byKey.get(c.parentKey) : undefined) {
      trail.unshift(c)
    }
    return trail
  }, [categories, category])

  const facetLabel = useMemo(() => {
    const m: Record<string, Record<string, string>> = {}
    for (const f of facetSet?.facets ?? []) m[f.key] = Object.fromEntries(f.options.map((o) => [o.value, o.label]))
    return m
  }, [facetSet])

  /** Every applied filter as an individually removable chip (FR-012). */
  const chips = useMemo(() => {
    const out: { key: string; label: string; remove: () => void }[] = []
    if (category)
      out.push({ key: "cat", label: categoryTrail.at(-1)?.name ?? facetLabel.category?.[category] ?? category, remove: () => setParam({ category: null }) })
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
  }, [category, categoryTrail, brands, attributes, saleOnly, minPrice, maxPrice, facetLabel, setParam, toggleParamValue])

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
      return `${edgeApiBaseUrl()}/storefront/v1/products?${p.toString()}`
    },
    [filterParams, sort],
  )

  const facetsUrl = useMemo(
    () => `${edgeApiBaseUrl()}/storefront/v1/facets?${filterParams().toString()}`,
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

  const FilterControls = useOnDemand(loadFilterControls)
  const controls = FilterControls ? (
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
  ) : (
    <p className="text-sm text-muted-foreground">Loading filters…</p>
  )

  const aisleName = category ? (categoryTrail.at(-1)?.name ?? facetLabel.category?.[category] ?? null) : null
  const heading = q.trim()
    ? `Results for “${q.trim()}”`
    : aisleName
      ? aisleName
      : saleOnly
        ? "On sale"
        : "All products"
  const crumbs: Crumb[] = [{ label: "Home", href: "/" }]
  if (q.trim()) crumbs.push({ label: "Search" })
  else if (aisleName || saleOnly)
    crumbs.push(
      { label: "All products", href: "/search" },
      // The aisles above the one being shown, each a way back up.
      ...categoryTrail.slice(0, -1).map((c) => ({ label: c.name, href: `/search?category=${encodeURIComponent(c.key)}` })),
      { label: heading },
    )
  else crumbs.push({ label: "All products" })

  return (
    <div className="container py-6">
      <Breadcrumb items={crumbs} />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">{heading}</h1>
      <p role="status" aria-live="polite" className="mt-1 min-h-5 text-sm text-muted-foreground">
        {total === null ? (loading ? "Searching…" : "") : `${total.toLocaleString()} ${total === 1 ? "result" : "results"}`}
      </p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
        <aside className="hidden lg:sticky lg:top-40 lg:block lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto lg:pr-1">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Filters</h2>
            {activeCount > 0 && (
              <button type="button" onClick={clearAllFilters} className={btnClass("ghost", "sm")}>
                Clear all
              </button>
            )}
          </div>
          {controls}
        </aside>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className={btnClass("outline", "lg", "lg:hidden")}
            >
              <SlidersHorizontal aria-hidden="true" />
              Filters
              {activeCount > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                  {activeCount}
                </span>
              )}
            </button>

            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={chip.remove}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium hover:bg-accent max-lg:hidden"
                aria-label={`Remove filter: ${chip.label}`}
              >
                {chip.label}
                <X aria-hidden="true" className="size-3" />
              </button>
            ))}
            {chips.length > 0 && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-sm font-medium text-primary underline underline-offset-4 max-lg:hidden"
              >
                Clear all
              </button>
            )}

            <label className="ml-auto flex items-center gap-2 text-sm">
              <span className="text-muted-foreground max-sm:sr-only">Sort by</span>
              <select
                value={appliedSort}
                onChange={(e) => {
                  const next = e.target.value as ProductSort
                  setParam({ sort: next === "newest" ? null : next })
                  void import("@/lib/telemetry").then(({ capture }) => capture({ name: "search_sorted", props: { sort: next } }))
                }}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm shadow-xs lg:h-9"
              >
                {q.trim() && <option value="relevance">{SORT_LABELS.relevance}</option>}
                <option value="newest">{SORT_LABELS.newest}</option>
                <option value="price_asc">{SORT_LABELS.price_asc}</option>
                <option value="price_desc">{SORT_LABELS.price_desc}</option>
              </select>
            </label>
          </div>

          {/* Phones: the chips get their own row so the Filters button and Sort stay on one line. */}
          {chips.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 lg:hidden">
              {chips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.remove}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium"
                  aria-label={`Remove filter: ${chip.label}`}
                >
                  {chip.label}
                  <X aria-hidden="true" className="size-3" />
                </button>
              ))}
            </div>
          )}

          {failed ? (
            <ResultState
              icon={CloudOff}
              title="We couldn’t load results just now"
              body="This is on us, not you. Please try again in a moment."
              action={{ label: "Try again", onClick: () => setParam({}) }}
            />
          ) : items.length === 0 && !loading ? (
            <ResultState
              icon={SearchX}
              title={q.trim() ? `No results for “${q.trim()}”` : "Nothing here yet"}
              body={activeCount > 0 ? "Your filters may be too narrow — try removing one." : "Check the spelling, try a shorter word, or browse the aisles."}
              action={
                activeCount > 0
                  ? { label: "Clear all filters", onClick: clearAllFilters }
                  : { label: "Browse the aisles", href: "/" }
              }
            />
          ) : items.length === 0 && loading ? (
            <div className={`mt-6 ${productGridNarrow}`} aria-hidden="true">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="space-y-3">
                  <div className="aspect-square w-full animate-pulse rounded-lg bg-muted" />
                  <div className="h-4 w-3/4 animate-pulse rounded-md bg-muted" />
                  <div className="h-5 w-1/3 animate-pulse rounded-md bg-muted" />
                </div>
              ))}
            </div>
          ) : (
            <div className={`mt-6 ${productGridNarrow}`}>
              {items.map((p) => (
                <ProductCard key={p.id} product={p} saveControl={<SaveControl productId={p.id} />} />
              ))}
            </div>
          )}

          <div ref={sentinelRef} className="h-10" aria-hidden="true" />
          {loading && items.length > 0 && (
            <p className="border-t py-4 text-center text-sm text-muted-foreground">Loading more…</p>
          )}
          {exhausted && items.length > 0 && (
            <div className="flex flex-col items-center gap-3 border-t py-6">
              <p className="text-sm text-muted-foreground">That’s everything.</p>
              <a href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0 }) }} className={btnClass("ghost", "sm")}>
                <ChevronUp aria-hidden="true" />
                Back to top
              </a>
            </div>
          )}
        </div>
      </div>

      {sheetOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 bg-scrim"
          />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-xl border-t bg-background shadow-lg">
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <h2 className="text-base font-semibold">Filters</h2>
              <button type="button" onClick={() => setSheetOpen(false)} aria-label="Close" className={iconBtnClass("ghost", "md")}>
                <X aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4">{controls}</div>
            <div className="border-t p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <ActionButton type="button" onClick={() => setSheetOpen(false)} size="xl" className="w-full">
                Show {total ?? ""} results
              </ActionButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ResultState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon
  title: string
  body: string
  action?: { label: string; onClick?: () => void; href?: string }
}) {
  return (
    <div className="mt-6 flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center">
      <span className="mb-2 grid size-12 place-items-center rounded-lg bg-muted">
        <Icon aria-hidden="true" className="size-6" />
      </span>
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="max-w-md text-sm text-muted-foreground">{body}</p>
      {action &&
        (action.href ? (
          <a href={action.href} className={btnClass("primary", "md", "mt-2")}>
            {action.label}
          </a>
        ) : (
          <button type="button" onClick={action.onClick} className={btnClass("primary", "md", "mt-2")}>
            {action.label}
          </button>
        ))}
    </div>
  )
}
