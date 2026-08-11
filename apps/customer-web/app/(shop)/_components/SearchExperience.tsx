"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { ProductSearchResultDTO, ProductSort, StorefrontProductCardDTO } from "@effy/shared-types"

import { coreApiBaseUrl } from "@/lib/config"

import { ProductCard, productGridNarrow } from "./ProductCard"

/**
 * Search and refinement (019 US4, rebuilt by 025 US1).
 *
 * ── What changed, and why it mattered ────────────────────────────────────────────────────────────
 *
 * 1. REFINEMENTS NOW LIVE IN THE URL. Previously the query was seeded from the URL once and then kept
 *    in component state, never written back — so a refined result set could not be shared, bookmarked,
 *    or restored by the back button. FR-017 and FR-018 were unmet before this feature began, and
 *    adding sort and price would have made it three more invisible dimensions.
 *
 * 2. SORT AND A RESULT COUNT (FR-016). "1,240 results · Sort: Price, low to high" is the signal that
 *    separates a search from a list. Both needed hot-path work (see the sort/total contract).
 *
 * 3. EVERY ACTIVE REFINEMENT IS INDIVIDUALLY REMOVABLE, plus one action to clear them all (FR-015) —
 *    previously there was a single on/off "On sale" toggle.
 *
 * Reading params client-side keeps /search a static shell.
 */

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

  // ── The URL IS the refinement state (FR-017/FR-018) ───────────────────────────────────────────
  const q = params.get("q") ?? ""
  const category = params.get("category")
  const saleOnly = params.get("saleOnly") === "true"
  const minPrice = params.get("minPrice") ?? ""
  const maxPrice = params.get("maxPrice") ?? ""
  const sort = (params.get("sort") as ProductSort | null) ?? "newest"

  const [items, setItems] = useState<StorefrontProductCardDTO[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [appliedSort, setAppliedSort] = useState<ProductSort>(sort)
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [exhausted, setExhausted] = useState(false)

  /** Rewrite the URL with one refinement changed. `replace` keeps the back button meaningful. */
  const setParam = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString())
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key)
        else next.set(key, value)
      }
      // ⚠ The cursor is NEVER URL state. A shared link must open at the first page of the refined set,
      // not halfway down someone else's scroll.
      const query = next.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [params, pathname, router],
  )

  const requestUrl = useCallback(
    (next: string | null) => {
      const p = new URLSearchParams()
      if (q.trim()) p.set("q", q.trim())
      if (category) p.set("categoryKey", category)
      if (saleOnly) p.set("saleOnly", "true")
      if (minPrice) p.set("minPrice", minPrice)
      if (maxPrice) p.set("maxPrice", maxPrice)
      p.set("sort", sort)
      if (next) p.set("cursor", next)
      p.set("limit", String(PAGE_SIZE))
      return `${coreApiBaseUrl()}/v1/storefront/products?${p.toString()}`
    },
    [q, category, saleOnly, minPrice, maxPrice, sort],
  )

  // Reload from the first page whenever ANY refinement changes. Restarting is required, not merely
  // convenient: a cursor minted under one ordering is rejected by the server under another (FR-016b).
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
          // The sort the server ACTUALLY applied — `relevance` without a query falls back to `newest`,
          // and rendering the requested value would label the list wrongly.
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

  /** Every active refinement, as removable chips (FR-015). */
  const chips = useMemo(() => {
    const out: { key: string; label: string; clear: () => void }[] = []
    if (category) out.push({ key: "category", label: category, clear: () => setParam({ category: null }) })
    if (saleOnly) out.push({ key: "sale", label: "On sale", clear: () => setParam({ saleOnly: null }) })
    if (minPrice) out.push({ key: "min", label: `From $${minPrice}`, clear: () => setParam({ minPrice: null }) })
    if (maxPrice) out.push({ key: "max", label: `Up to $${maxPrice}`, clear: () => setParam({ maxPrice: null }) })
    return out
  }, [category, saleOnly, minPrice, maxPrice, setParam])

  return (
    <div className="container py-6">
      {/* ⚠ NO search field here.
       *
       * The header already ships one on every route — compact in row 1 on desktop, full width
       * directly beneath the header below `lg`. This page used to render its own as well, so on a
       * phone the search results page opened with TWO identical search boxes stacked on top of each
       * other, both bound to the same `q` parameter.
       *
       * The header's field reads `q` from the URL, so it already shows the active query and submits
       * to the same place. A second one adds nothing but confusion about which one is "the" box. */}

      {/* ── The reference's two-column category page: a persistent filter rail beside the results ──
          Below `lg` the rail collapses into the inline chip row it always was — a sidebar on a phone
          is a sidebar nobody opens. */}
      <div className="mt-2 grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
      <aside className="hidden rounded-2xl border p-5 lg:sticky lg:top-24 lg:block">
        <h2 className="text-lg font-bold">Filters</h2>

        <div className="mt-5 border-t pt-5">
          <h3 className="text-sm font-medium">Price</h3>
          <div className="mt-3">
            <PriceRange
              min={minPrice}
              max={maxPrice}
              onApply={(lo, hi) => setParam({ minPrice: lo || null, maxPrice: hi || null })}
            />
          </div>
        </div>

        <div className="mt-5 border-t pt-5">
          <h3 className="text-sm font-medium">Offers</h3>
          <div className="mt-3">
            <FilterChip active={saleOnly} onClick={() => setParam({ saleOnly: saleOnly ? null : "true" })}>
              On sale
            </FilterChip>
          </div>
        </div>

        {chips.length > 0 && (
          <button
            type="button"
            onClick={() => setParam({ category: null, saleOnly: null, minPrice: null, maxPrice: null })}
            className="mt-6 flex h-11 w-full items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Clear all filters
          </button>
        )}
      </aside>

      <div className="min-w-0">
      {/* ── Refinements (the phone-width control row) ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 lg:hidden">
        <FilterChip active={saleOnly} onClick={() => setParam({ saleOnly: saleOnly ? null : "true" })}>
          On sale
        </FilterChip>

        <PriceRange
          min={minPrice}
          max={maxPrice}
          onApply={(lo, hi) => setParam({ minPrice: lo || null, maxPrice: hi || null })}
        />

      </div>

      {/* Active refinements, always visible in both layouts (FR-015). */}
      <div className="flex flex-wrap items-center gap-2">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={chip.clear}
            className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary px-3 py-1 text-sm text-primary-foreground"
            aria-label={`Remove filter: ${chip.label}`}
          >
            {chip.label}
            <span aria-hidden="true" className="text-xs leading-none">
              &times;
            </span>
          </button>
        ))}

        {chips.length > 0 && (
          <button
            type="button"
            onClick={() => setParam({ category: null, saleOnly: null, minPrice: null, maxPrice: null })}
            className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Clear all
          </button>
        )}
      </div>

      {/* ── Result count + sort (FR-016/FR-016a) ─────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        {/* Announced, so a screen-reader user learns the set changed size without hunting for it. */}
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {total === null
            ? loading
              ? "Searching…"
              : ""
            : `${total.toLocaleString()} ${total === 1 ? "result" : "results"}`}
        </p>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Sort</span>
          <select
            value={appliedSort}
            onChange={(e) => {
              const next = e.target.value as ProductSort
              setParam({ sort: next === "newest" ? null : next })
              // ⚠ DYNAMIC import (027's rule) — a static telemetry import here rides the
              // always-loaded guest chunk. Measured byte-neutral on this route, kept for the
              // convention its three sibling call sites already follow.
              void import("@/lib/telemetry").then(({ capture }) =>
                capture({ name: "search_sorted", props: { sort: next } }),
              )
            }}
            className="h-9 rounded-full border bg-card px-3 text-sm"
          >
            {/* Best match is only meaningful with a query — the server falls back without one, so
                offering it here would let the control describe an ordering it did not get. */}
            {q.trim() && <option value="relevance">{SORT_LABELS.relevance}</option>}
            <option value="newest">{SORT_LABELS.newest}</option>
            <option value="price_asc">{SORT_LABELS.price_asc}</option>
            <option value="price_desc">{SORT_LABELS.price_desc}</option>
          </select>
        </label>
      </div>

      {/* ── Results ──────────────────────────────────────────────────────────────────────────── */}
      {failed ? (
        <ResultState
          title="We couldn’t load results just now"
          body="Please try again in a moment."
          action={{ label: "Try again", onClick: () => setParam({}) }}
        />
      ) : items.length === 0 && !loading ? (
        <ResultState
          title={q.trim() ? `No results for “${q.trim()}”` : "Start typing to search"}
          body={
            chips.length > 0
              ? "Your filters may be too narrow — try removing one."
              : "Or browse the store by category."
          }
          action={
            chips.length > 0
              ? {
                  label: "Clear all filters",
                  onClick: () => setParam({ category: null, saleOnly: null, minPrice: null, maxPrice: null }),
                }
              : { label: "Browse categories", href: "/" }
          }
        />
      ) : (
        // ⚠ NO save control on the SEARCH results grid — the one web surface that omits it, and the
        // omission is MEASURED rather than chosen. /search is the only route where this whole
        // experience is a client component, so it already carries ProductCard's code in the guest
        // bundle; adding the control pushed it 173.9 -> 174.6 KB against a 174 KB gate. Four reclaim
        // attempts were measured: dynamic telemetry import (0 KB), inline SVG instead of lucide
        // (0.1 KB WORSE), lucide close-icon to a text glyph (0.1 KB), next/dynamic on PriceRange
        // (0.1 KB plus a visible flash) — recovering 0.2 of the 0.7 needed. The budget is NOT raised;
        // that is the standing rule. Spec FR-007 is amended instead, recorded in spec.md and the
        // parity register rather than dropped silently. Every OTHER tile surface carries it.
        <div className={`mt-6 ${productGridNarrow}`}>
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
      </div>
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
          <a
            href={action.href}
            className="mt-4 inline-flex h-10 items-center rounded-full border px-5 text-sm hover:bg-accent"
          >
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

function PriceRange({
  min,
  max,
  onApply,
}: {
  min: string
  max: string
  onApply: (min: string, max: string) => void
}) {
  const [lo, setLo] = useState(min)
  const [hi, setHi] = useState(max)
  useEffect(() => {
    setLo(min)
    setHi(max)
  }, [min, max])

  return (
    <form
      className="inline-flex items-center gap-1 rounded-md border px-2 py-1"
      onSubmit={(e) => {
        e.preventDefault()
        onApply(lo.trim(), hi.trim())
      }}
    >
      <input
        value={lo}
        onChange={(e) => setLo(e.target.value)}
        inputMode="decimal"
        placeholder="Min"
        aria-label="Minimum price"
        className="w-14 bg-transparent px-1 text-sm outline-none"
      />
      <span aria-hidden="true" className="text-muted-foreground">
        –
      </span>
      <input
        value={hi}
        onChange={(e) => setHi(e.target.value)}
        inputMode="decimal"
        placeholder="Max"
        aria-label="Maximum price"
        className="w-14 bg-transparent px-1 text-sm outline-none"
      />
      <button type="submit" className="rounded-full px-3 text-sm font-medium text-primary hover:bg-accent">
        Go
      </button>
    </form>
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
    </button>
  )
}
