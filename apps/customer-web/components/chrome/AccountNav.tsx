import { Suspense } from "react"
import Link from "next/link"
import { LogOut } from "lucide-react"

import { ACCOUNT_SECTIONS } from "@/components/header/account-links"
import { Avatar } from "@/components/ui/misc"
import { initialsFor } from "@/lib/initials"
import { getSession } from "@/lib/session"

import { AccountNavLink } from "./AccountNavLink"

const linkBase =
  "flex h-9 shrink-0 items-center gap-3 rounded-md px-3 text-sm whitespace-nowrap text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:size-4"

/**
 * The account area's navigation (reference: Shared components · Account navigation).
 *
 * A sidebar from `lg`: who is signed in, then one entry per section, then sign-out.
 *
 * ⚠ BELOW `lg` IT IS NOT RENDERED AT ALL — the same entries are the account level of the menu drawer
 * (`MobileNavIsland`), which opens on that level on these pages. It used to be one scrolling row
 * above the page, and that row was the account area's responsive bug: a non-wrapping row inside a
 * grid track is that track's minimum width, so every account page was laid out ~1,450px wide on a
 * phone.
 *
 * ⚠ Sign-out is a POST form, never a link (a GET sign-out is a CSRF logout).
 * ⚠ The identity block reads the session, so it is its own Suspense island; the links are static.
 */
export function AccountNav() {
  return (
    <nav aria-label="Account" className="sticky top-40 self-start max-lg:hidden">
      <div className="mb-4">
        <Suspense fallback={<div aria-hidden="true" className="h-12" />}>
          <Identity />
        </Suspense>
      </div>
      <ul className="flex flex-col gap-1">
        {ACCOUNT_SECTIONS.map(({ href, label, Icon, exact }) => {
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
        <li className="mt-3 border-t pt-3">
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
