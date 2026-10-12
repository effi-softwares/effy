import { ChevronDown, LogOut } from "lucide-react"
import Link from "next/link"

import { AccountMenuAutoClose } from "@/components/header/AccountMenuAutoClose"
import { ACCOUNT_LINKS } from "@/components/header/account-links"
import { Avatar } from "@/components/ui/misc"
import { initialsFor } from "@/lib/initials"

const item = "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"

/**
 * The header's account trigger and dropdown (reference: Home · Account dropdown).
 *
 * The trigger is the avatar, the customer's first name and their points; the menu is the one list
 * in `account-links.ts` plus sign-out.
 *
 * ⚠ A `<details>`, not a scripted menu: it opens without JavaScript, and `AccountMenuAutoClose` adds
 * only the three behaviours a native disclosure lacks (outside press, Escape, following a link).
 *
 * ⚠ `points` is null when the balance could not be read. The trigger then shows the name alone — it
 * never shows "0 pts" for a customer who may have some.
 */
export function AccountMenu({
  givenName,
  familyName,
  email,
  points,
}: {
  givenName: string | null
  familyName: string | null
  email: string | null
  points: number | null
}) {
  const name = [givenName, familyName].filter(Boolean).join(" ") || "Your account"
  const pts = points === null ? null : points.toLocaleString("en-AU")

  return (
    <details className="group relative" data-testid="account-menu" data-menu="account">
      <AccountMenuAutoClose />
      <summary
        aria-label={name}
        data-testid="account-menu-trigger"
        className="flex h-11 list-none items-center gap-2 rounded-md py-1 pr-2.5 pl-1 hover:bg-accent group-open:bg-accent [&::-webkit-details-marker]:hidden"
      >
        <Avatar initials={initialsFor(givenName, familyName) ?? "·"} />
        <span className="flex flex-col text-left">
          <span className="max-w-28 truncate text-sm leading-none font-medium">{givenName ?? "Account"}</span>
          {pts !== null && <span className="mt-1 text-xs leading-none text-primary">{pts} pts</span>}
        </span>
        <ChevronDown aria-hidden="true" className="size-3.5 text-muted-foreground" />
      </summary>

      <div className="absolute right-0 z-50 mt-2 w-[260px] rounded-md border bg-popover p-1 shadow-md">
        <div className="px-2 py-1.5">
          <p data-testid="menu-greeting" className="truncate text-sm font-medium">
            Hi, {givenName ?? "there"}
          </p>
          {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
        </div>
        <div className="-mx-1 my-1 h-px bg-border" />
        {ACCOUNT_LINKS.map(({ href, label, testId, Icon, group }, i) => (
          <div key={href}>
            {group === "help" && ACCOUNT_LINKS[i - 1]?.group !== "help" && (
              <div className="-mx-1 my-1 h-px bg-border" />
            )}
            <Link href={href} data-testid={testId} className={item}>
              <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              {label}
              {href === "/account/points" && pts !== null && (
                <span className="ml-auto text-xs text-muted-foreground">{pts}</span>
              )}
            </Link>
          </div>
        ))}
        <form action="/sign-out" method="post">
          <button type="submit" data-testid="menu-sign-out" className={item}>
            <LogOut className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            Sign out
          </button>
        </form>
      </div>
    </details>
  )
}
