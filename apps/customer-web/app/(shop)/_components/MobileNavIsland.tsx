import { LogOut } from "lucide-react"
import Link from "next/link"

import { Avatar } from "@/components/ui/misc"
import { initialsFor } from "@/lib/initials"
import { AccountNavLink } from "@/components/chrome/AccountNavLink"
import { ACCOUNT_LINKS, ACCOUNT_SECTIONS } from "@/components/header/account-links"
import { getSession } from "@/lib/session"

import { aisleIcon } from "@/components/chrome/aisle-icon"
import { btnClass } from "@/components/storefront/actions"
import { aisleHref, getCategoriesSafe, topLevel } from "@/lib/categories"

import { MobileNav } from "./MobileNav"

const drawerLink =
  "flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors hover:bg-accent aria-[current=page]:bg-accent"

/**
 * The drawer, with its account level filled in — A DYNAMIC HOLE (research D4, same shape as
 * `UserIsland`).
 *
 * ⚠ WHY THE SESSION READ HAPPENS HERE AND NOT INSIDE `MobileNav`. `MobileNav` is a client component,
 * so it cannot read cookies; and the drawer must look genuinely different for the two audiences —
 * a guest gets a one-tap "Sign in" at the foot, a signed-in customer gets an avatar that drills into
 * their account. Handing the client component a `null` panel is how that decision crosses the
 * boundary: the SERVER decides, and there is no way for the client to guess wrong.
 *
 * ⚠ It must stay inside the `<Suspense>` the layout wraps it in, and the layout itself must never
 * read cookies — either change converts every public page from a cached static shell to
 * request-time rendering. The fallback renders the hamburger, so the shell still ships instantly.
 *
 * ⚠ ZERO ADDED CLIENT JS. The account level is plain links and a `<form>`, server-rendered and
 * passed in as children — the same trick `AccountMenu` uses. A guest downloads none of it.
 */
export async function MobileNavIsland() {
  const [session, categories] = await Promise.all([getSession(), getCategoriesSafe()])
  const top = topLevel(categories)
  const aisles =
    top.length > 0 ? (
      <>
        <p className="mt-4 mb-1 px-3 text-xs font-medium text-muted-foreground">Aisles</p>
        <ul className="flex flex-col gap-1">
          {top.map((aisle) => {
            const Icon = aisleIcon(aisle.name)
            return (
              <li key={aisle.key}>
                <Link
                  href={aisleHref(aisle.key)}
                  className="flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium hover:bg-accent"
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  {aisle.name}
                </Link>
              </li>
            )
          })}
        </ul>
      </>
    ) : null

  if (!session) {
    return (
      <MobileNav
        aisles={aisles}
        accountTrigger={
          <Link
            href="/sign-in"
            className={btnClass("primary", "lg", "w-full")}
            data-testid="drawer-sign-in-link"
          >
            Sign in
          </Link>
        }
      />
    )
  }

  const name = [session.givenName, session.familyName].filter(Boolean).join(" ") || "Your account"

  return (
    <MobileNav
      aisles={aisles}
      accountTitle={name}
      accountRoots={ACCOUNT_SECTIONS.map((s) => s.href)}
      accountTrigger={
        <>
          <Avatar initials={initialsFor(session.givenName, session.familyName) ?? "·"} />
          <span className="truncate text-sm font-medium">{name}</span>
        </>
      }
      accountPanel={
        <>
          {/* ⚠ EVERY section of the account area, not the header dropdown's short list: below `lg`
              the account sidebar is not rendered, so this level IS the account navigation. The
              entries and their glyphs come from the one shared list the sidebar reads. */}
          <ul className="flex flex-col gap-1">
            {ACCOUNT_SECTIONS.map(({ href, label, Icon, exact }) => (
              <li key={href}>
                <AccountNavLink href={href} exact={exact} className={drawerLink}>
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  {label}
                </AccountNavLink>
              </li>
            ))}
          </ul>

          <ul className="mt-2 flex flex-col gap-1 border-t pt-2">
            {ACCOUNT_LINKS.filter((l) => l.group === "help").map(({ href, label, testId, Icon }) => (
              <li key={href}>
                <Link href={href} data-testid={testId} className={drawerLink}>
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>

          {/* ⚠ POST, not GET. A GET sign-out is triggerable by any <img src="/sign-out"> anywhere on
              the internet — a CSRF logout. A form also means sign-out works with JavaScript
              disabled, which is a nice thing to be able to say about the control that ends a
              session. Separated by a rule because it is the one destructive entry in the list. */}
          <form action="/sign-out" method="post" className="mt-2 border-t pt-2">
            <button
              type="submit"
              data-testid="drawer-sign-out"
              className={`${drawerLink} w-full text-left`}
            >
              <LogOut className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              Sign out
            </button>
          </form>
        </>
      }
    />
  )
}
