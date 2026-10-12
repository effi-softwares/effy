"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

/** One sidebar entry, knowing only whether it is the current page. Glyph and label are server-rendered children. */
export function AccountNavLink({
  href,
  exact = false,
  children,
}: {
  href: string
  exact?: boolean
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/")
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="flex h-9 shrink-0 items-center gap-3 rounded-md px-3 text-sm whitespace-nowrap text-muted-foreground hover:bg-accent hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground [&_svg]:size-4"
    >
      {children}
    </Link>
  )
}
