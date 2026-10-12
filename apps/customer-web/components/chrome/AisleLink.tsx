"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

import { cn } from "@/lib/utils"

/**
 * One entry in the header's aisle row, knowing only whether it is the current one.
 *
 * ⚠ The glyph and label arrive as `children`, rendered on the server. This component is the smallest
 * thing that needs the URL — it exists so the row's icons and markup stay out of the client bundle.
 *
 * `match` says what "current" means: an aisle key (`/search?category=`), the sale listing
 * (`/search?saleOnly=true`), or nothing.
 */
export function AisleLink({
  href,
  match,
  className,
  children,
}: {
  href: string
  match: { category: string } | { sale: true }
  className?: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const params = useSearchParams()
  const onSearch = pathname === "/search"
  const active =
    onSearch &&
    ("sale" in match
      ? params.get("saleOnly") === "true"
      : params.getAll("category").includes(match.category))

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-2 rounded-md pr-3 pl-2.5 text-sm font-medium whitespace-nowrap hover:bg-accent",
        "[&_svg]:size-4 [&_svg]:text-muted-foreground",
        "aria-[current=page]:bg-foreground aria-[current=page]:text-background aria-[current=page]:[&_svg]:text-background",
        className,
      )}
    >
      {children}
    </Link>
  )
}

/** Before the URL is known (the static shell): the same link, never marked current. */
export function AisleLinkFallback({
  href,
  className,
  children,
}: {
  href: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-2 rounded-md pr-3 pl-2.5 text-sm font-medium whitespace-nowrap hover:bg-accent",
        "[&_svg]:size-4 [&_svg]:text-muted-foreground",
        className,
      )}
    >
      {children}
    </Link>
  )
}
