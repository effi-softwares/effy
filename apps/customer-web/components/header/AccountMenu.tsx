import { LogOut } from "lucide-react"
import Link from "next/link"

import { Avatar } from "@/components/Avatar"
import { AccountMenuAutoClose } from "@/components/header/AccountMenuAutoClose"
import { ACCOUNT_LINKS } from "@/components/header/account-links"

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
 *
 * ⚠ THE GREETING LIVES HERE, NOT IN THE HEADER ROW. "Hi, <name>" used to sit beside the avatar, where
 * it cost the one row every other control competes for — and the amount it cost was UNPREDICTABLE,
 * because a name is between two and twenty characters, so the search field beside it changed width
 * per customer. Inside the panel it is free: the panel has a fixed width, and the greeting is the
 * thing that tells you WHOSE account the entries below belong to, which is exactly the question a
 * shared or forgotten session raises. The avatar keeps the identity visible in the row itself.
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
      {/* Restores dismiss-on-outside-click / Escape, which native <details> does not do on its own.
          A signed-in-only client component, so the guest bundle is untouched. */}
      <AccountMenuAutoClose />
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

      {/* Three sections, separated by rules rather than by spacing alone: WHO you are, WHERE you can
          go, and the one entry that ENDS the session. The divider before sign-out is the point of the
          grouping — it is the only destructive item here, and a flat list puts it one pixel below a
          navigation link. */}
      <div className="absolute right-0 z-50 mt-2 w-60 rounded-md border bg-popover p-1 shadow-md">
        {/* The greeting, relocated out of the header row. `truncate` because a long name must not
            widen the panel or wrap onto a second line above the entries. */}
        <p
          data-testid="menu-greeting"
          className="truncate px-3 py-2 text-sm font-medium text-foreground"
        >
          Hi, {givenName ?? "there"}
        </p>

        <div className="my-1 border-t" />

        {/* ⚠ The list is shared with the drawer's account panel (`account-links.ts`) so the two
            cannot drift — the icon travels with the entry for the same reason the label does. This
            menu is a zero-JS server component (<details> + a form), so adding an entry there costs
            the guest bundle nothing here either. */}
        {ACCOUNT_LINKS.map(({ href, label, testId, Icon }) => (
          <Link
            key={href}
            href={href}
            data-testid={testId}
            className="flex items-center gap-3 rounded-sm px-3 py-2 text-sm hover:bg-accent"
          >
            {/* `shrink-0` so the glyph keeps its size when a long label is doing the truncating, and
                `aria-hidden` because the label beside it already says everything the icon does. */}
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            {label}
          </Link>
        ))}

        <div className="my-1 border-t" />

        {/* ⚠ POST, not GET. A GET sign-out is triggerable by any <img src="/sign-out"> anywhere on
            the internet — a CSRF logout. */}
        <form action="/sign-out" method="post">
          <button
            type="submit"
            data-testid="menu-sign-out"
            className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-sm hover:bg-accent"
          >
            <LogOut className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            Sign out
          </button>
        </form>
      </div>
    </details>
  )
}
