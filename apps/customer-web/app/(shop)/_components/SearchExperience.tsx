"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { FacetSetDTO, ProductSearchResultDTO, ProductSort, StorefrontProductCardDTO } from "@effy/shared-types"

import { ChevronUp, CloudOff, SearchX, SlidersHorizontal, X } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { btnClass } from "@/components/storefront/actions"
import { useOnDemand } from "@/lib/use-on-demand"
import { Breadcrumb, type Crumb } from "@/components/ui/misc"
import { edgeApiBaseUrl } from "@/lib/config"
import { facetsQuery, productsQuery, readRefinement, type SearchInitial } from "@/lib/search-query"

import { FIRST_ROW, ProductCard, ProductGridSkeleton, productGridNarrow } from "./ProductCard"
import { SaveControl } from "./SaveControl"
import type { SelectedFilters } from "./filters/FilterControls"

/**
 * Search and refinement. Every facet is in the URL (`q`, `categoryKey`, `saleOnly`,
 * `minPrice`/`maxPrice`, `sort`, repeated `brand` and `attr.<key>`), so a search can be shared and
 * restored. The server reads the first page and hands it over as `initial`; from there the browser
 * refines and pages directly, rewriting the address with `history.replaceState` (a router navigation
 * would re-render on the server for every filter tick). `initial` is used only for its own query and
 * while fresh (`FRESH_MS`, 60 s). The filter controls and the phone sheet load on demand
 * (`useOnDemand`): /search is near its bundle budget.
 */

const loadFilterControls = () => import("./filters/FilterControls").then((m) => m.default)
const loadFilterSheet = () => import("./filters/FilterControls").then((m) => m.FilterSheet)

const SORT_LABELS: Record<ProductSort, string> = {
  relevance: "Best match",
  newest: "Newest",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
}

/** How late a listing may be shown. */
const FRESH_MS = 60_000

/** One listing as it stands on screen: the pages loaded so far and where the next one starts. */
interface Shown {
  query: string
  /** When its first page was read, by this browser's clock. */
  at: number
  items: StorefrontProductCardDTO[]
  total: number | null
  sort: ProductSort
  cursor: string | null
  facets?: FacetSetDTO | null
}

/**
 * The listing last on screen, kept for the life of the tab so Back from a product returns to the
 * pages already loaded — and, because they are there on the first render, to the same scroll position.
 */
let kept: Shown | null = null

/** Which server answer was taken for a query, and when — what tells a replayed render from a new one. */
const taken = new Map<string, { stamp: number; at: number }>()

/** The server's first page, when it answers `query` and is not a replay gone stale. */
function fromServer(query: string, initial: SearchInitial | null | undefined): Shown | null {
  if (initial?.query !== query) return null
  const now = Date.now()
  const before = taken.get(query)
  const replay = before?.stamp === initial.at
  if (replay && now - before.at > FRESH_MS) return null
  const at = replay ? before.at : now
  taken.set(query, { stamp: initial.at, at })
  const { items, total, sort, nextCursor } = initial.result
  return { query, at, items, total, sort, cursor: nextCursor, facets: initial.facets }
}

function startFrom(query: string, initial: SearchInitial | null | undefined): Shown | null {
  if (kept?.query === query && Date.now() - kept.at <= FRESH_MS) return kept
  return fromServer(query, initial)
}

const read = <T,>(path: string, signal?: AbortSignal): Promise<T> =>
  fetch(`${edgeApiBaseUrl()}/storefront/v1/${path}`, { signal }).then((r) =>
    r.ok ? (r.json() as Promise<T>) : Promise.reject(r.status),
  )

/** What the page needs to name a category: its own name and where it sits. */
export interface CategoryName {
  key: string
  name: string
  parentKey: string | null
}

export function SearchExperience({
  categories = [],
  initial,
}: {
  categories?: readonly CategoryName[]
  initial?: SearchInitial | null
}) {
  const pathname = usePathname()
  const params = useSearchParams()

  // Refinement state, read from the URL
  const refinement = useMemo(() => readRefinement(params), [params])
  const { q, category, saleOnly, minPrice, maxPrice, sort, brands, attributes } = refinement
  const query = useMemo(() => productsQuery(refinement), [refinement])
  const facetsFor = useMemo(() => facetsQuery(refinement), [refinement])

  const [start] = useState(() => startFrom(query, initial))
  /** The query whose results are on screen; null while there are none to show. */
  const shown = useRef(start ? query : null)
  const firstPageAt = useRef(start?.at ?? 0)
  /** The query the address asks for now — a page that comes back for an earlier one is dropped. */
  const asked = useRef(query)
  asked.current = query

  const [items, setItems] = useState<StorefrontProductCardDTO[]>(start?.items ?? [])
  const [total, setTotal] = useState<number | null>(start?.total ?? null)
  const [appliedSort, setAppliedSort] = useState<ProductSort>(start?.sort ?? sort)
  const [cursor, setCursor] = useState<string | null>(start?.cursor ?? null)
  const [loading, setLoading] = useState(start === null)
  const [failed, setFailed] = useState(false)
  const [moreFailed, setMoreFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const [facetSet, setFacetSet] = useState<FacetSetDTO | null>(start?.facets ?? null)
  const facetsShown = useRef(start?.facets ? facetsFor : null)
  const [facetsLoading, setFacetsLoading] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  const go = useCallback(
    (next: URLSearchParams) => {
      const search = next.toString()
      window.history.replaceState(null, "", search ? `${pathname}?${search}` : pathname)
    },
    [pathname],
  )

  /** Rewrite the URL. Values may be a string, null (remove), or string[] (repeated param). */
  const setParam = useCallback(
    (patch: Record<string, string | string[] | null>) => {
      const next = new URLSearchParams(params.toString())
      for (const [key, value] of Object.entries(patch)) {
        next.delete(key)
        if (Array.isArray(value)) for (const v of value) next.append(key, v)
        else if (value !== null && value !== "") next.set(key, value)
      }
      // The cursor is never URL state — a shared link opens at the first page.
      go(next)
    },
    [params, go],
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

  /** All active filters, and how many — drives the mobile trigger badge. */
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
    go(next)
  }, [q, sort, go])

  const selected: SelectedFilters = useMemo(
    () => ({ category, brands, attributes, saleOnly }),
    [category, brands, attributes, saleOnly],
  )

  // value → label lookup per facet, so a chip reads "Vegan", not "vegan". A selected value is
  // always present in its facet (own-selection is excluded from that facet's counts), so it resolves.
  /**
   * The chosen category and the aisles above it, outermost first.
   *
   * From the category tree, not from the facet counts. The counts only list categories that have a
   * product filed directly in them, and an aisle ("Fruit & veg") holds everything in its sub-aisles
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

  /** Every applied filter as an individually removable chip. */
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

  // Reading
  const show = useCallback(
    (next: Shown) => {
      shown.current = next.query
      firstPageAt.current = next.at
      setItems(next.items)
      setTotal(next.total)
      setAppliedSort(next.sort)
      setCursor(next.cursor)
      setLoading(false)
      if (next.facets) {
        facetsShown.current = facetsFor
        setFacetSet(next.facets)
      }
    },
    [facetsFor],
  )

  // Reload from the first page whenever any refinement changes (FR-016b: a cursor is sort/filter
  // specific, so restarting is required, not merely convenient). Debounced so a burst of ticks
  // becomes one refresh — but only a refinement waits: arriving at a listing the
  // server could not read asks at once.
  const arrived = useRef(false)
  useEffect(() => {
    const wait = arrived.current ? 250 : 0
    arrived.current = true
    // Back at what is already on screen (a filter ticked and unticked): nothing to read.
    if (shown.current === query) return setLoading(false)
    // A navigation that kept this component mounted brought its own first page.
    const given = fromServer(query, initial)
    if (given) return show(given)

    const controller = new AbortController()
    setLoading(true)
    setFailed(false)
    setMoreFailed(false)
    const timer = setTimeout(() => {
      read<ProductSearchResultDTO>(`products?${query}`, controller.signal)
        .then((data) =>
          show({ query, at: Date.now(), items: data.items, total: data.total, sort: data.sort, cursor: data.nextCursor }),
        )
        .catch((err) => {
          if (err?.name === "AbortError") return
          shown.current = null
          setFailed(true)
          setItems([])
          setTotal(null)
          setCursor(null)
          setLoading(false)
        })
    }, wait)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
    // `attempt` is "Try again": the same query, asked once more.
  }, [query, initial, show, attempt])

  // Facets recompute on filter change (not on paginate — loadMore never touches this). Debounced with
  // the same rhythm so rapid ticking makes one facets refresh.
  const facetsArrived = useRef(false)
  useEffect(() => {
    const wait = facetsArrived.current ? 250 : 0
    facetsArrived.current = true
    if (facetsShown.current === facetsFor) return setFacetsLoading(false)
    const controller = new AbortController()
    setFacetsLoading(true)
    const timer = setTimeout(() => {
      read<FacetSetDTO>(`facets?${facetsFor}`, controller.signal)
        .then((data) => {
          facetsShown.current = facetsFor
          setFacetSet(data)
          setFacetsLoading(false)
        })
        .catch((err) => {
          if (err?.name === "AbortError") return
          setFacetSet(null)
          setFacetsLoading(false)
        })
    }, wait)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [facetsFor])

  // Back from a product returns to what was loaded (see `kept`).
  useEffect(() => {
    if (shown.current) kept = { query: shown.current, at: firstPageAt.current, items, total, sort: appliedSort, cursor }
  }, [items, total, appliedSort, cursor])

  /**
   * A page that fails is not the end of the list. It says so and offers the page again; until the
   * shopper asks, scrolling does not — the sentinel is still on screen, and would ask without pause.
   */
  const loadMore = useCallback(
    (again = false) => {
      if (!cursor || loading || (moreFailed && !again)) return
      setLoading(true)
      setMoreFailed(false)
      read<ProductSearchResultDTO>(`products?${productsQuery(refinement, cursor)}`)
        .then((data) => {
          if (asked.current !== query) return
          setItems((prev) => [...prev, ...data.items])
          setCursor(data.nextCursor)
          setLoading(false)
        })
        .catch(() => {
          if (asked.current !== query) return
          setMoreFailed(true)
          setLoading(false)
        })
    },
    [cursor, loading, moreFailed, refinement, query],
  )
  const exhausted = cursor === null && !loading

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
  const FilterSheet = useOnDemand(loadFilterSheet)
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
              action={{ label: "Try again", onClick: () => setAttempt((n) => n + 1) }}
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
            <ProductGridSkeleton className={`mt-6 ${productGridNarrow}`} />
          ) : (
            <div className={`mt-6 ${productGridNarrow}`}>
              {items.map((p, i) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  saveControl={<SaveControl productId={p.id} />}
                  priority={i < FIRST_ROW}
                />
              ))}
            </div>
          )}

          <div ref={sentinelRef} className="h-10" aria-hidden="true" />
          {loading && items.length > 0 && (
            <p className="border-t py-4 text-center text-sm text-muted-foreground">Loading more…</p>
          )}
          {moreFailed && (
            <div className="flex flex-col items-center gap-3 border-t py-6">
              <p role="status" className="text-sm text-muted-foreground">We couldn’t load more just now.</p>
              <button type="button" onClick={() => loadMore(true)} className={btnClass("outline", "sm")}>
                Try again
              </button>
            </div>
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

      {sheetOpen && FilterSheet && (
        <FilterSheet total={total} onClose={() => setSheetOpen(false)}>
          {controls}
        </FilterSheet>
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
