"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

import { cn } from "@/lib/utils"

/**
 * The catalogue navigation — the bottom-right half of the two-row header (shadcn navbar-03 pattern).
 *
 * The reference's distinguishing detail is the PIPE SEPARATORS between links and the active item
 * carried in weight and colour rather than an underline. Both are reproduced here.
 *
 * ⚠ It is a client component only because the active item is derived from the current route. That is
 * the whole reason — no data, no state. It reads `useSearchParams` as well as the path because two of
 * these entries differ ONLY by query string ("All products" vs "On sale"), and matching on pathname
 * alone would light up both at once.
 */

const LINKS = [
  { label: "Home", href: "/" },
  { label: "Browse", href: "/browse" },
  { label: "All products", href: "/search" },
  { label: "On sale", href: "/search?saleOnly=true" },
] as const

export function PrimaryNav({ className }: { className?: string }) {
  const pathname = usePathname()
  const params = useSearchParams()
  const saleOnly = params.get("saleOnly") === "true"

  function isActive(href: string): boolean {
    const [path, query] = href.split("?")
    if (pathname !== path) return false
    // Distinguish /search from /search?saleOnly=true — same path, different destination.
    if (path === "/search") return query ? saleOnly : !saleOnly
    return true
  }

  return (
    <nav aria-label="Primary" className={cn("hidden items-center md:flex", className)}>
      {LINKS.map((link, i) => {
        const active = isActive(link.href)
        return (
          <span key={link.href} className="flex items-center">
            {i > 0 && (
              // The reference's pipe divider. Decorative — a screen reader should hear four links,
              // not four links and three vertical bars.
              <span aria-hidden="true" className="mx-3 h-4 w-px bg-border lg:mx-4" />
            )}
            <Link
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "text-sm transition-colors",
                active ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {link.label}
            </Link>
          </span>
        )
      })}
    </nav>
  )
}

/** The shell's copy, rendered while the route-aware version streams in. */
export function PrimaryNavFallback({ className }: { className?: string }) {
  return (
    <nav aria-label="Primary" className={cn("hidden items-center md:flex", className)}>
      {LINKS.map((link, i) => (
        <span key={link.href} className="flex items-center">
          {i > 0 && <span aria-hidden="true" className="mx-3 h-4 w-px bg-border lg:mx-4" />}
          <Link href={link.href} className="text-sm text-muted-foreground hover:text-foreground">
            {link.label}
          </Link>
        </span>
      ))}
    </nav>
  )
}
