import Link from "next/link"

import { AccountMenu } from "@/components/header/AccountMenu"
import { AuthSync } from "@/components/header/AuthSync"
import { btnClass } from "@/components/storefront/actions"
import { getPoints } from "@/lib/customer-reads"
import { getSession } from "@/lib/session"
import { Bone } from "@/components/ui/skeletons"

/**
 * The personalized corner of the header — a streamed server island.
 *
 * This is the only place the header reads the session, and it must stay inside a <Suspense>
 * boundary (see app/layout.tsx rule 1): reading cookies above one defers the whole app to request
 * time and every page loses its static shell.
 *
 * The points balance rides the same island. A failed read is `null`, never zero — the trigger then
 * shows the name alone rather than telling a customer with points that they have none.
 */
export async function UserIsland() {
  const session = await getSession()

  if (!session) {
    return (
      <Link href="/sign-in" className={btnClass("outline", "md")} data-testid="sign-in-link">
        Sign in
      </Link>
    )
  }

  let points: number | null = null
  try {
    const balance = await getPoints()
    points = balance ? Number(balance.points) : null
    if (points !== null && !Number.isFinite(points)) points = null
  } catch {
    points = null
  }

  return (
    <div className="flex items-center" data-testid="account-link">
      <AccountMenu
        givenName={session.givenName}
        familyName={session.familyName}
        email={session.email}
        points={points}
      />
      <AuthSync />
    </div>
  )
}

export function UserIslandSkeleton() {
  return (
    <span aria-hidden="true" data-testid="user-island-skeleton">
      <Bone kind="control" className="w-28" />
    </span>
  )
}
