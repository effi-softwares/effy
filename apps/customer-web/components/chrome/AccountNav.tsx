import { Suspense } from "react"
import Link from "next/link"
import {
  Coins,
  CreditCard,
  FileText,
  Heart,
  House,
  Lock,
  LogOut,
  MapPin,
  Package,
  ShieldCheck,
  UserRound,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { Avatar } from "@/components/ui/misc"
import { initialsFor } from "@/lib/initials"
import { getSession } from "@/lib/session"

import { AccountNavLink } from "./AccountNavLink"

const ITEMS: ReadonlyArray<{ href: string; label: string; Icon: LucideIcon; exact?: boolean }> = [
  { href: "/account", label: "Overview", Icon: House, exact: true },
  { href: "/orders", label: "Orders", Icon: Package },
  { href: "/saved", label: "Saved items & lists", Icon: Heart },
  { href: "/account/points", label: "Effy points", Icon: Coins },
  { href: "/account/personal", label: "Personal info", Icon: UserRound },
  { href: "/addresses", label: "Address book", Icon: MapPin },
  { href: "/account/payment", label: "Payment methods", Icon: CreditCard },
  { href: "/account/security", label: "Security", Icon: Lock },
  { href: "/account/privacy", label: "Privacy & data", Icon: ShieldCheck },
  { href: "/account/legal", label: "Legal", Icon: FileText },
]

const linkBase =
  "flex h-9 shrink-0 items-center gap-3 rounded-md px-3 text-sm whitespace-nowrap text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:size-4"

/**
 * The account area's navigation (reference: Shared components · Account navigation).
 *
 * A sidebar from `lg`: who is signed in, then one entry per section, then sign-out. Below `lg` the
 * same entries are ONE scrolling row above the page — a phone gets every destination without a
 * second menu to open.
 *
 * ⚠ Sign-out is a POST form, never a link (a GET sign-out is a CSRF logout).
 * ⚠ The identity block reads the session, so it is its own Suspense island; the links are static.
 */
export function AccountNav() {
  return (
    <nav aria-label="Account" className="lg:sticky lg:top-40 lg:self-start">
      <div className="mb-4 max-lg:hidden">
        <Suspense fallback={<div aria-hidden="true" className="h-12" />}>
          <Identity />
        </Suspense>
      </div>
      <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden">
        {ITEMS.map(({ href, label, Icon, exact }) => {
          const inner = (
            <>
              <Icon aria-hidden="true" />
              {label}
            </>
          )
          return (
            <li key={href}>
              <Suspense
                fallback={
                  <Link href={href} className={linkBase}>
                    {inner}
                  </Link>
                }
              >
                <AccountNavLink href={href} exact={exact}>
                  {inner}
                </AccountNavLink>
              </Suspense>
            </li>
          )
        })}
        <li className="lg:mt-3 lg:border-t lg:pt-3">
          <form action="/sign-out" method="post">
            <button type="submit" className={`${linkBase} w-full`} data-testid="account-nav-sign-out">
              <LogOut aria-hidden="true" />
              Sign out
            </button>
          </form>
        </li>
      </ul>
    </nav>
  )
}

async function Identity() {
  const session = await getSession()
  if (!session) return <div aria-hidden="true" className="h-12" />
  const name = [session.givenName, session.familyName].filter(Boolean).join(" ") || "Your account"
  return (
    <div className="flex items-center gap-3">
      <Avatar size="lg" initials={initialsFor(session.givenName, session.familyName) ?? "·"} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{name}</p>
        {session.email && <p className="truncate text-xs text-muted-foreground">{session.email}</p>}
      </div>
    </div>
  )
}
