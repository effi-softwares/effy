import { Suspense } from "react"
import Link from "next/link"
import { LogOut } from "lucide-react"

import { ACCOUNT_SECTIONS } from "@/components/header/account-links"
import { Avatar } from "@/components/ui/misc"
import { initialsFor } from "@/lib/initials"
import { getSession } from "@/lib/session"

import { AccountNavLink } from "./AccountNavLink"

const linkBase =
  "flex h-9 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:size-4"
const sectionLink = `${linkBase} aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground`

/**
 * The account area's navigation: a sidebar from `lg` (who is signed in, the sections, sign-out). Below
 * `lg` it is not rendered; the menu drawer opens on its account level instead. Sign-out is a POST form.
 * The identity block reads the session, so it is its own Suspense island.
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
                <AccountNavLink href={href} exact={exact} className={sectionLink}>
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
