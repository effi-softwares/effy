"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

/**
 * One account-section link, knowing only whether it is the current page (`aria-current`). Its look is
 * the caller's — the sidebar and the menu drawer each pass their own; glyph and label are
 * server-rendered children.
 */
export function AccountNavLink({
  href,
  exact = false,
  className,
  children,
}: {
  href: string
  exact?: boolean
  className: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/")
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={className}>
      {children}
    </Link>
  )
}
