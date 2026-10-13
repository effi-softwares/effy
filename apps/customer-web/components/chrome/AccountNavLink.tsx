"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const sidebarLink =
  "flex h-9 shrink-0 items-center gap-3 rounded-md px-3 text-sm whitespace-nowrap text-muted-foreground hover:bg-accent hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground [&_svg]:size-4"

/** One sidebar entry, knowing only whether it is the current page. Glyph and label are server-rendered children. */
export function AccountNavLink({
  href,
  exact = false,
  className = sidebarLink,
  children,
}: {
  href: string
  exact?: boolean
  /** The row's look. The sidebar's by default; the menu drawer passes its own, taller one. */
  className?: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/")
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={className}
    >
      {children}
    </Link>
  )
}
