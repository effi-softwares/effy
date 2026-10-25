"use client"

import type { FacetDTO, FacetSetDTO } from "@effy/shared-types"
import { useEffect, useState } from "react"

import { X } from "lucide-react"

import { ActionButton, btnClass, iconBtnClass } from "@/components/storefront/actions"

/**
 * The advanced filter controls, shared by the desktop side panel and the phone filter sheet. Loaded via
 * `next/dynamic` from SearchExperience, off the first-load chunk, and built from native inputs (the
 * design-system drawer and checkbox bring vaul and radix) to stay inside the guest budget.
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
    <div>
      {/* Offers — a fixed toggle, not a server facet in this slice (contract). */}
      <Section title="Offers">
        <label className="flex min-h-7 cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={selected.saleOnly}
            onChange={onToggleSale}
            className="size-4 rounded-sm accent-primary"
          />
          On sale
        </label>
      </Section>

      <Section title="Price">
        <PriceRange min={priceMin} max={priceMax} bounds={facetSet?.priceBounds ?? null} onApply={onApplyPrice} />
      </Section>

      {category && category.options.length > 0 && (
        <Section title={category.label}>
          <ul className="space-y-1">
            <li>
              <button
                type="button"
                onClick={() => onCategory(null)}
                className={`flex min-h-7 items-center gap-2 text-sm ${radio(selected.category === null)}`}
                aria-pressed={selected.category === null}
              >
                <span aria-hidden="true" data-dot className="size-4 shrink-0 rounded-full border border-input shadow-xs" />
                All categories
              </button>
            </li>
            {category.options.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => onCategory(o.value)}
                  className={`flex min-h-7 w-full items-center justify-between gap-2 text-left text-sm ${radio(selected.category === o.value)}`}
                  aria-pressed={selected.category === o.value}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span aria-hidden="true" data-dot className="size-4 shrink-0 rounded-full border border-input shadow-xs" />
                    <span className="truncate">{o.label}</span>
                  </span>
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
        <ActionButton type="button" onClick={onClearAll} variant="outline" size="md" className="mt-4 w-full">
          Clear all filters
        </ActionButton>
      )}
    </div>
  )
}

/** The category list reads as radios: the chosen one fills its dot blue. */
function radio(on: boolean): string {
  return on
    ? "font-medium [&_[data-dot]]:border-primary [&_[data-dot]]:bg-primary-fill [&_[data-dot]]:shadow-[inset_0_0_0_3px_var(--background)]"
    : "hover:text-foreground"
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b py-4 first:pt-0">
      <h3 className="mb-3 text-sm font-medium">{title}</h3>
      {children}
    </div>
  )
}

/** How many options a facet shows before "Show more". */
const FACET_COLLAPSE_LIMIT = 8

/** A multi-select facet as a checkbox list, each option showing its count. Large facets collapse to
 *  the top options behind a "Show more" affordance. A selected option below the fold is
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
      : // Keep the top options and any selected option that would otherwise be hidden.
        facet.options.filter((o, i) => i < FACET_COLLAPSE_LIMIT || selectedValues.includes(o.value))

  return (
    <Section title={facet.label}>
      <ul className="space-y-1">
        {visible.map((o) => (
          <li key={o.value}>
            <label className="flex cursor-pointer items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedValues.includes(o.value)}
                  onChange={() => onToggle(o.value)}
                  className="size-4 shrink-0 rounded-sm accent-primary"
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
          className="mt-3 text-sm font-medium text-primary underline underline-offset-4"
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
        // Correct an inverted range rather than sending it (which would return nothing).
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
        className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-xs"
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
        className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-xs"
      />
      <button type="submit" className={btnClass("outline", "md", "px-3")}>
        Go
      </button>
    </form>
  )
}

/**
 * The phone and tablet filter sheet: a native bottom overlay around the same controls. Lives here so
 * it arrives with them, on demand, and never in /search's first-load chunk.
 */
export function FilterSheet({
  total,
  onClose,
  children,
}: {
  total: number | null
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
      <button type="button" aria-label="Close filters" onClick={onClose} className="absolute inset-0 bg-scrim" />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-xl border-t bg-background shadow-lg">
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <h2 className="text-base font-semibold">Filters</h2>
          <button type="button" onClick={onClose} aria-label="Close" className={iconBtnClass("ghost", "md")}>
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">{children}</div>
        <div className="border-t p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <ActionButton type="button" onClick={onClose} size="xl" className="w-full">
            Show {total ?? ""} results
          </ActionButton>
        </div>
      </div>
    </div>
  )
}
