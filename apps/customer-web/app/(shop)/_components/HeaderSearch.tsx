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
          placeholder="Search groceries, brands and more…"
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
          placeholder="Search groceries, brands and more…"
          aria-label="Search products"
          className={`w-full rounded-full border bg-card pl-11 pr-4 ${size === "lg" ? "h-12 text-base" : "h-10 text-sm"}`}
        />
      </div>
    </form>
  )
}
