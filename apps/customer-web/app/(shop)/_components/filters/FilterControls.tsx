"use client"

import type { FacetDTO, FacetSetDTO } from "@effy/shared-types"
import { useEffect, useState } from "react"

/**
 * The advanced filter controls (043 US1) — one presentational component rendered in BOTH the desktop
 * side panel (lg+) and the mobile/tablet filter sheet, so the two surfaces are the same controls.
 *
 * ⚠ CODE-SPLIT ON PURPOSE. `/search` is the one fully-client storefront route and sits ~2 KB under the
 * 174 KB guest budget (bundle-budget.mjs). This whole tree is loaded via `next/dynamic` from
 * SearchExperience, so it never enters the route's first-load chunk. That is also why it uses native
 * inputs rather than the design-system `drawer`/`checkbox` (vaul + radix): the budget doctrine (025
 * FR-007, 033) forbids raising the limit, and the lightest control that does the job wins.
 */

export interface SelectedFilters {
  category: string | null
  brands: string[]
  attributes: Record<string, string[]>
  saleOnly: boolean
}

interface Props {
  facetSet: FacetSetDTO | null
  loading: boolean
  selected: SelectedFilters
  priceMin: string
  priceMax: string
  onCategory: (value: string | null) => void
  onToggleValue: (facetKey: string, value: string) => void
  onToggleSale: () => void
  onApplyPrice: (min: string, max: string) => void
  onClearAll: () => void
  activeCount: number
}

export default function FilterControls({
  facetSet,
  loading,
  selected,
  priceMin,
  priceMax,
  onCategory,
  onToggleValue,
  onToggleSale,
  onApplyPrice,
  onClearAll,
  activeCount,
}: Props) {
  const category = facetSet?.facets.find((f) => f.key === "category")
  // Brand + attribute facets are all multi_select; category is handled on its own above the rest.
  const multiFacets = (facetSet?.facets ?? []).filter((f) => f.type === "multi_select")

  return (
    <div className="space-y-5">
      {/* Offers — a fixed toggle, not a server facet in this slice (contract). */}
      <Section title="Offers">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={selected.saleOnly}
            onChange={onToggleSale}
            className="h-4 w-4 accent-primary"
          />
          On sale
        </label>
      </Section>

      <Section title="Price">
        <PriceRange min={priceMin} max={priceMax} bounds={facetSet?.priceBounds ?? null} onApply={onApplyPrice} />
      </Section>

      {category && category.options.length > 0 && (
        <Section title={category.label}>
          <ul className="space-y-1.5">
            <li>
              <button
                type="button"
                onClick={() => onCategory(null)}
                className={`text-sm ${selected.category === null ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                aria-pressed={selected.category === null}
              >
                All categories
              </button>
            </li>
            {category.options.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => onCategory(o.value)}
                  className={`flex w-full items-center justify-between gap-2 text-left text-sm ${
                    selected.category === o.value ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                  aria-pressed={selected.category === o.value}
                >
                  <span className="truncate">{o.label}</span>
                  <span className="tabular-nums text-xs text-muted-foreground">{o.count}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {multiFacets.map((facet) => (
        <FacetSection
          key={facet.key}
          facet={facet}
          selectedValues={facet.key === "brand" ? selected.brands : (selected.attributes[facet.key] ?? [])}
          onToggle={(value) => onToggleValue(facet.key, value)}
        />
      ))}

      {loading && !facetSet && <p className="text-sm text-muted-foreground">Loading filters…</p>}
      {!loading && facetSet && facetSet.facets.length === 0 && (
        <p className="text-sm text-muted-foreground">No filters for this result set.</p>
      )}

      {activeCount > 0 && (
        <button
          type="button"
          onClick={onClearAll}
          className="flex h-11 w-full items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Clear all filters
        </button>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t pt-5 first:border-t-0 first:pt-0">
      <h3 className="mb-3 text-sm font-medium">{title}</h3>
      {children}
    </div>
  )
}

/** How many options a facet shows before "Show more" (043 US2 / FR-011). */
const FACET_COLLAPSE_LIMIT = 8

/** A multi-select facet as a checkbox list, each option showing its count. Large facets collapse to
 *  the top options behind a "Show more" affordance (FR-011). A selected option below the fold is
 *  always shown, so it can be seen and unticked. */
function FacetSection({
  facet,
  selectedValues,
  onToggle,
}: {
  facet: FacetDTO
  selectedValues: string[]
  onToggle: (value: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  if (facet.options.length === 0) return null

  const overflow = facet.options.length > FACET_COLLAPSE_LIMIT
  const visible =
    !overflow || expanded
      ? facet.options
      : // Keep the top options AND any selected option that would otherwise be hidden.
        facet.options.filter((o, i) => i < FACET_COLLAPSE_LIMIT || selectedValues.includes(o.value))

  return (
    <Section title={facet.label}>
      <ul className="space-y-1.5">
        {visible.map((o) => (
          <li key={o.value}>
            <label className="flex cursor-pointer items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedValues.includes(o.value)}
                  onChange={() => onToggle(o.value)}
                  className="h-4 w-4 shrink-0 accent-primary"
                />
                <span className="truncate">{o.label}</span>
              </span>
              <span className="tabular-nums text-xs text-muted-foreground">{o.count}</span>
            </label>
          </li>
        ))}
      </ul>
      {overflow && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-sm font-medium text-primary hover:underline"
        >
          {expanded ? "Show less" : `Show ${facet.options.length - FACET_COLLAPSE_LIMIT} more`}
        </button>
      )}
    </Section>
  )
}

/** Min/max price. Corrects an inverted range (min > max) before applying — FR-004. */
function PriceRange({
  min,
  max,
  bounds,
  onApply,
}: {
  min: string
  max: string
  bounds: { min: string; max: string } | null
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
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        let a = lo.trim()
        let b = hi.trim()
        // FR-004: correct an inverted range rather than sending it (which would return nothing).
        if (a !== "" && b !== "" && Number(a) > Number(b)) {
          ;[a, b] = [b, a]
          setLo(a)
          setHi(b)
        }
        onApply(a, b)
      }}
    >
      <input
        value={lo}
        onChange={(e) => setLo(e.target.value)}
        inputMode="decimal"
        placeholder={bounds ? bounds.min : "Min"}
        aria-label="Minimum price"
        className="w-16 rounded-md border bg-transparent px-2 py-1 text-sm outline-none"
      />
      <span aria-hidden="true" className="text-muted-foreground">
        –
      </span>
      <input
        value={hi}
        onChange={(e) => setHi(e.target.value)}
        inputMode="decimal"
        placeholder={bounds ? bounds.max : "Max"}
        aria-label="Maximum price"
        className="w-16 rounded-md border bg-transparent px-2 py-1 text-sm outline-none"
      />
      <button type="submit" className="rounded-full px-3 py-1 text-sm font-medium text-primary hover:bg-accent">
        Go
      </button>
    </form>
  )
}
