"use client"

import { Search } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"

/**
 * The persistent search entry (025 FR-011).
 *
 * Before this, "search" on the storefront was a LINK styled to look like an input: tapping it
 * navigated to /search, where the real input lived. That is one wasted step on the single most-used
 * action in a store, and it made search feel like a destination rather than a tool.
 *
 * Submitting navigates to /search with the query as a parameter — refinements stay query params so
 * discovery keeps its crawl and cache policy (FR-017).
 */

/**
 * ⚠ SHORT ON PURPOSE, and shared by both renderers below so they cannot drift.
 *
 * The compact field in the header is the narrowest place this component appears, and the previous
 * copy — "Search groceries, brands and more…" — was clipped mid-word there: the header read
 * "Search groceries, brands anc". A truncated placeholder is worse than a terse one. It reads as a
 * rendering fault rather than as copy, and the words it drops are precisely the ones that were doing
 * the explaining, so the length bought nothing and cost the field its credibility.
 *
 * It is sized for the TIGHTER of the two placements. The full-width row on small screens has room
 * for more, but a second string would be a second thing to keep true.
 */
const PLACEHOLDER = "Search products…"
export function HeaderSearch({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  const router = useRouter()
  const params = useSearchParams()
  const [value, setValue] = useState("")

  // Keep the box in step with the URL, so a shopper who lands on a shared /search?q=… link sees their
  // own query in the field rather than an empty box above populated results.
  useEffect(() => {
    setValue(params.get("q") ?? "")
  }, [params])

  return (
    <form
      role="search"
      className={className}
      onSubmit={(e) => {
        e.preventDefault()
        const q = value.trim()
        router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search")
      }}
    >
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          name="q"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={PLACEHOLDER}
          aria-label="Search products"
          className={`w-full rounded-full border bg-card pl-11 pr-4 ${size === "lg" ? "h-12 text-base" : "h-10 text-sm"}`}
        />
      </div>
    </form>
  )
}

/**
 * The shell's version of the search box, rendered while the URL-bound one streams in.
 *
 * It is a real, submittable form — not a skeleton — so search works from the cached static shell even
 * before hydration, and a crawler sees a search affordance in the raw HTML.
 */
export function HeaderSearchFallback({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  return (
    <form role="search" action="/search" className={className}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          name="q"
          placeholder={PLACEHOLDER}
          aria-label="Search products"
          className={`w-full rounded-full border bg-card pl-11 pr-4 ${size === "lg" ? "h-12 text-base" : "h-10 text-sm"}`}
        />
      </div>
    </form>
  )
}
