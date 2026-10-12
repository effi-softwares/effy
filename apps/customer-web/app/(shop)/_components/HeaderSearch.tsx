"use client"

import { Search } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

const PLACEHOLDER = "Search groceries and essentials…"

const shell =
  "flex min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-background pr-1 pl-3 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/20"
const field =
  "h-full min-w-0 flex-1 border-0 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm [&::-webkit-search-cancel-button]:hidden"
const submit =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground shadow-xs hover:bg-primary/90"

/**
 * The header search (reference: Shared components · Storefront header).
 *
 * Desktop: the field, an aisle chooser, and a Search button in one bordered control. Phone
 * (`size="lg"`): the field alone at 44 tall — the aisle is chosen from the listing's own filters.
 *
 * ⚠ The focus ring is on the SHELL (`focus-within`), not the input: the input has no border of its
 * own, so its default outline would draw a second box inside the first. Field borders are a hairline
 * by design, and this ring is what makes focus visible.
 *
 * ⚠ It stays a real `<form>`: Enter submits, and without JavaScript `HeaderSearchFallback` posts the
 * same `q` and `category` to `/search`.
 */
export function HeaderSearch({
  className,
  size = "md",
  aisles,
}: {
  className?: string
  size?: "md" | "lg"
  aisles?: ReadonlyArray<{ key: string; name: string }>
}) {
  const router = useRouter()
  const params = useSearchParams()

  const [value, setValue] = useState("")
  const [aisle, setAisle] = useState("")

  useEffect(() => {
    setValue(params.get("q") ?? "")
    setAisle(params.get("category") ?? "")
  }, [params])

  return (
    <form
      role="search"
      className={cn(shell, size === "lg" ? "h-11" : "h-[42px]", className)}
      onSubmit={(e) => {
        e.preventDefault()
        const next = new URLSearchParams()
        const q = value.trim()
        if (q) next.set("q", q)
        if (aisle) next.set("category", aisle)
        const qs = next.toString()
        router.push(qs ? `/search?${qs}` : "/search")
      }}
    >
      <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <input
        type="search"
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={PLACEHOLDER}
        aria-label="Search products"
        className={field}
      />
      {aisles && aisles.length > 0 && (
        <select
          name="category"
          value={aisle}
          onChange={(e) => setAisle(e.target.value)}
          aria-label="Search in"
          className="h-8 w-[136px] shrink-0 rounded-md border-0 bg-muted px-2 text-sm outline-none"
        >
          <option value="">All aisles</option>
          {aisles.map((a) => (
            <option key={a.key} value={a.key}>
              {a.name}
            </option>
          ))}
        </select>
      )}
      {size === "md" && (
        <button type="submit" className={submit}>
          Search
        </button>
      )}
    </form>
  )
}

/** The field before hydration and without JavaScript: a plain GET form to `/search`. */
export function HeaderSearchFallback({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  return (
    <form role="search" action="/search" className={cn(shell, size === "lg" ? "h-11" : "h-[42px]", className)}>
      <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <input type="search" name="q" placeholder={PLACEHOLDER} aria-label="Search products" className={field} />
      {size === "md" && (
        <button type="submit" className={submit}>
          Search
        </button>
      )}
    </form>
  )
}
