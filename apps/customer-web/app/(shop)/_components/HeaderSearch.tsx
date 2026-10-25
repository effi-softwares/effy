"use client"

import { History, Search } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useId, useRef, useState } from "react"
import type { SuggestionsDTO } from "@effy/shared-types"

import { formatMoney } from "@/lib/money"
import { capture } from "@/lib/telemetry"
import { clsx } from "clsx"

const PLACEHOLDER = "Search groceries and essentials…"

const shell =
  "flex min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-background pr-1 pl-3 shadow-xs focus-within:border-ring"
const field =
  "h-full min-w-0 flex-1 border-0 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm [&::-webkit-search-cancel-button]:hidden"
const submit =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90"

/* Recent searches: this device's own, kept on this device */

const RECENT_KEY = "effy:recent-searches"
const RECENT_MAX = 5

function readRecent(): string[] {
  try {
    const stored = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]") as unknown
    return Array.isArray(stored) ? stored.filter((v): v is string => typeof v === "string").slice(0, RECENT_MAX) : []
  } catch {
    return []
  }
}

function rememberSearch(q: string): void {
  try {
    const next = [q, ...readRecent().filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, RECENT_MAX)
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable — there is simply no history */
  }
}

/* What the list under the field offers */

type Kind = "phrase" | "aisle" | "product" | "recent"
interface Option {
  kind: Kind
  href: string
  /** What searching for it would be, for the recent list. Absent for a product or an aisle. */
  query?: string
  label: React.ReactNode
  detail?: string
}

const searchHref = (q: string, category?: string) => {
  const p = new URLSearchParams({ q })
  if (category) p.set("category", category)
  return `/search?${p.toString()}`
}

/** The typed part in bold, the rest as offered — so the eye lands on what is new in each line. */
function emphasised(text: string, typed: string): React.ReactNode {
  if (!typed || !text.toLowerCase().startsWith(typed.toLowerCase())) return text
  return (
    <>
      <span className="font-semibold">{text.slice(0, typed.length)}</span>
      {text.slice(typed.length)}
    </>
  )
}

function optionsFor(found: SuggestionsDTO | null, recent: string[], typed: string) {
  const phrases: Option[] = (found?.phrases ?? []).map((p) =>
    p.categorySlug && p.text === p.categoryName
      ? { kind: "aisle", href: `/search?category=${encodeURIComponent(p.categorySlug)}`, label: p.text, detail: "Aisle" }
      : {
          kind: "phrase",
          href: searchHref(p.text, p.categorySlug),
          query: p.categorySlug ? undefined : p.text,
          label: (
            <>
              {emphasised(p.text, typed)}
              {p.categoryName && <span className="text-muted-foreground"> in {p.categoryName}</span>}
            </>
          ),
        },
  )
  const products: Option[] = (found?.products ?? []).map((p) => ({
    kind: "product",
    href: `/product/${p.id}`,
    label: p.name,
    detail: formatMoney(p.priceAmount, p.currency),
  }))
  const recents: Option[] = recent
    .filter((r) => r.toLowerCase() !== typed.toLowerCase())
    .map((r) => ({ kind: "recent", href: searchHref(r), query: r, label: r }))
  return [
    { title: "Suggestions", options: phrases },
    { title: "Products", options: products },
    { title: "Recent searches", options: recents },
  ].filter((g) => g.options.length > 0)
}

const DEBOUNCE_MS = 200
const MIN_CHARS = 2

/**
 * The header search. Desktop: field, aisle chooser and Search in one control; phone: the field alone.
 * While focused, a list of completions, a few products and recent searches (arrows, Enter, Escape). The
 * list is an addition: typing and Enter always search, and without JavaScript `HeaderSearchFallback`
 * posts the same `q` and `category`. The focus ring is on the shell, since the input has no border.
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
  const listId = useId()

  const [value, setValue] = useState("")
  const [aisle, setAisle] = useState("")
  const [open, setOpen] = useState(false)
  const [found, setFound] = useState<SuggestionsDTO | null>(null)
  const [recent, setRecent] = useState<string[]>([])
  const [active, setActive] = useState(-1)
  const form = useRef<HTMLFormElement>(null)

  useEffect(() => {
    setValue(params.get("q") ?? "")
    setAisle(params.get("category") ?? "")
    setOpen(false)
  }, [params])

  const typed = value.trim()

  // Debounced, and a stale answer is cancelled so "oa" never lands on top of "oat milk".
  useEffect(() => {
    if (!open || typed.length < MIN_CHARS) {
      setFound(null)
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      fetch(`/api/suggestions?q=${encodeURIComponent(typed)}`, { signal: controller.signal })
        .then((res) => (res.ok ? (res.json() as Promise<SuggestionsDTO>) : null))
        .then((body) => setFound(body))
        .catch(() => {
          /* cancelled or unavailable — the field carries on without a list */
        })
    }, DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [open, typed])

  const groups = open ? optionsFor(found, recent, typed) : []
  const flat = groups.flatMap((g) => g.options)
  const showing = flat.length > 0

  function go(option: Option) {
    capture({ name: "search_suggestion_selected", props: { kind: option.kind } })
    if (option.query) rememberSearch(option.query)
    setOpen(false)
    router.push(option.href)
  }

  return (
    <form
      ref={form}
      role="search"
      className={clsx(shell, "relative", size === "lg" ? "h-11" : "h-11", className)}
      onSubmit={(e) => {
        e.preventDefault()
        const next = new URLSearchParams()
        if (typed) {
          next.set("q", typed)
          rememberSearch(typed)
        }
        if (aisle) next.set("category", aisle)
        const qs = next.toString()
        setOpen(false)
        router.push(qs ? `/search?${qs}` : "/search")
      }}
      // Leaving the whole control closes the list; moving within it (to the aisle chooser) does not.
      onBlur={(e) => {
        if (!form.current?.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <input
        type="search"
        name="q"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setActive(-1)
          setOpen(true)
        }}
        onFocus={() => {
          setRecent(readRecent())
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false)
            return
          }
          if (!showing) return
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault()
            const step = e.key === "ArrowDown" ? 1 : -1
            // One step past either end is "nothing chosen": Enter then searches for what was typed.
            setActive((i) => ((i + 1 + step + flat.length + 1) % (flat.length + 1)) - 1)
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault()
            go(flat[active])
          }
        }}
        placeholder={PLACEHOLDER}
        aria-label="Search products"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showing}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        className={field}
      />
      {aisles && aisles.length > 0 && (
        <select
          name="category"
          value={aisle}
          onChange={(e) => setAisle(e.target.value)}
          aria-label="Search in"
          className="h-8 w-34 shrink-0 rounded-md border-0 bg-muted px-2 text-sm outline-none"
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

      <div
        id={listId}
        role="listbox"
        aria-label="Search suggestions"
        hidden={!showing}
        className="absolute top-full left-0 z-50 mt-2 w-full max-w-186 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
      >
        {groups.map((group, g) => {
          const offset = groups.slice(0, g).reduce((n, earlier) => n + earlier.options.length, 0)
          return (
            <div key={group.title} role="group" aria-label={group.title} className="border-b p-1 last:border-b-0">
              <p aria-hidden="true" className="px-2 py-2 text-xs font-medium text-muted-foreground">
                {group.title}
              </p>
              {group.options.map((option, i) => {
                const index = offset + i
                const Icon = option.kind === "recent" ? History : Search
                return (
                  <div
                    key={`${option.kind}-${option.href}`}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === active}
                    // `mousedown`, prevented, so the field does not blur (closing the list) before the click lands.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => go(option)}
                    onMouseMove={() => setActive(index)}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-accent"
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {option.detail && (
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{option.detail}</span>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </form>
  )
}

/** The field before hydration and without JavaScript: a plain GET form to `/search`. */
export function HeaderSearchFallback({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  return (
    <form role="search" action="/search" className={clsx(shell, size === "lg" ? "h-11" : "h-11", className)}>
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
