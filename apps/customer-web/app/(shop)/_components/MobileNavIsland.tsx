import Link from "next/link"

import { Avatar } from "@/components/Avatar"
import { ACCOUNT_LINKS } from "@/components/header/account-links"
import { readServerSession } from "@/lib/session"

import { MobileNav } from "./MobileNav"

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
  const session = await readServerSession()

  if (!session) {
    return (
      <MobileNav
        accountTrigger={
          <Link
            href="/sign-in"
            className="inline-flex h-10 w-full items-center justify-center rounded-md border bg-transparent px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
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
      accountTitle={name}
      accountTrigger={
        <>
          <Avatar
            givenName={session.givenName}
            familyName={session.familyName}
            // The name sits right beside it, so announcing the avatar too would read the name twice.
            labelledByAdjacentName
            className="size-9 text-sm"
          />
          <span className="truncate text-sm font-medium">{name}</span>
        </>
      }
      accountPanel={
        <>
          <ul className="flex flex-col gap-1">
            {ACCOUNT_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  data-testid={link.testId}
                  className="flex h-12 items-center rounded-md px-3 text-base text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {link.label}
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
              className="flex h-12 w-full items-center rounded-md px-3 text-left text-base text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Sign out
            </button>
          </form>
        </>
      }
    />
  )
}
