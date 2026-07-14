import Link from "next/link"

import { Avatar } from "@/components/Avatar"

/**
 * The header account menu (012 FR-028).
 *
 * ⚠⚠ A SERVER COMPONENT. ZERO CLIENT JAVASCRIPT. ⚠⚠
 *
 * This is on the GUEST PATH — the header renders on every page, including every page an anonymous
 * visitor sees. So everything it imports is a cost the guest pays, and everything it imports is
 * scrutinised by the `depcruise` quarantine.
 *
 * Two things follow, and both are the opposite of how you would normally write this component:
 *
 * ⚠ THE DISCLOSURE IS `<details>/<summary>`, NOT `useState`.
 *   A dropdown is the canonical reason to reach for a client component. But `<details>` is a native
 *   HTML disclosure widget: it opens, it closes, it is keyboard-accessible and screen-reader-announced,
 *   and it costs exactly zero bytes of JavaScript. The React version would cost the guest a client
 *   component, a hydration boundary, and the router — to reproduce something the browser already does.
 *
 * ⚠ SIGN-OUT IS A `<form action="/sign-out">`, NOT AN IMPORTED SERVER ACTION.
 *   Importing the action would give `components/header/` a module path to `lib/dal.ts` → `aws-amplify`.
 *   Next would erase it at the `"use server"` boundary and not actually ship the SDK — but the guard
 *   (correctly) refuses to reason about that, and fired. A form posts to a URL, which is a *string*,
 *   so no import edge exists at all. The guard passes for the right reason instead of a suppressed one.
 *
 *   It also means sign-out WORKS WITH JAVASCRIPT DISABLED, which is a nice thing to be able to say
 *   about the control that ends a session.
 */
export function AccountMenu({
  givenName,
  familyName,
}: {
  givenName: string | null
  familyName: string | null
}) {
  const name = [givenName, familyName].filter(Boolean).join(" ") || "Your account"

  return (
    <details className="group relative" data-testid="account-menu">
      <summary
        aria-label={name}
        data-testid="account-menu-trigger"
        className="flex cursor-pointer list-none items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
      >
        {/* Standalone — no visible name beside it on small screens — so it carries its own
            accessible name via the <summary> above rather than announcing it twice. */}
        <Avatar
          givenName={givenName}
          familyName={familyName}
          labelledByAdjacentName
          className="size-9 text-sm"
        />
      </summary>

      <div className="absolute right-0 z-50 mt-2 w-56 rounded-md border bg-popover p-1 shadow-md">
        <Link
          href="/account"
          data-testid="menu-account"
          className="block rounded-sm px-3 py-2 text-sm hover:bg-accent"
        >
          Your account
        </Link>

        {/* ⚠ POST, not GET. A GET sign-out is triggerable by any <img src="/sign-out"> anywhere on
            the internet — a CSRF logout. */}
        <form action="/sign-out" method="post">
          <button
            type="submit"
            data-testid="menu-sign-out"
            className="block w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-accent"
          >
            Sign out
          </button>
        </form>
      </div>
    </details>
  )
}
