"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { chromePrefetch } from "@/lib/account-routes"

const base =
  "flex min-h-12 flex-col items-center gap-1 py-2 text-xs leading-4 font-medium text-muted-foreground aria-[current=page]:font-semibold aria-[current=page]:text-foreground [&_svg]:size-6"

/**
 * One bottom-bar entry, knowing only whether it is the current one.
 *
 * The glyph and label arrive as `children`, rendered on the server: this is the smallest thing that
 * needs the URL, and keeping the five icons out of it is worth ~1 KB on every guest page.
 *
 * `prefixes` are path prefixes that count as "here"; `exact` matches the path alone (Home).
 */
export function BottomBarLink({
  href,
  exact = false,
  prefixes,
  children,
}: {
  href: string
  exact?: boolean
  prefixes: readonly string[]
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const active = exact ? pathname === href : prefixes.some((p) => pathname.startsWith(p))
  return (
    <Link href={href} prefetch={chromePrefetch(href)} aria-current={active ? "page" : undefined} className={base}>
      {children}
    </Link>
  )
}

/** Before the URL is known: the same link, never marked current. */
export function BottomBarLinkFallback({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} prefetch={chromePrefetch(href)} className={base}>
      {children}
    </Link>
  )
}
