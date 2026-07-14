import Link from "next/link"

import { readServerSession } from "@/lib/session"

/**
 * THE PERSONALIZED ISLAND (research D4, FR-007).
 *
 * This component is the answer to the central design problem of an SSR storefront:
 *
 *   A header that greets you by name, or shows your cart count, is DIFFERENT FOR EVERY VISITOR.
 *   Naively, that makes every page that contains the header dynamic and uncacheable — which
 *   destroys the CDN, the speed, and the crawlability that this entire surface exists for.
 *   Personalization eats the cache.
 *
 * The resolution is not to give up personalization, and not to give up the cache. It is to make
 * this one component a HOLE:
 *
 *   • The page body around it is `use cache` and PRERENDERS into a static shell.
 *   • This component reads cookies(), so Next defers ONLY THIS SUBTREE to request time.
 *   • It is wrapped in <Suspense> by the (shop) layout, so the shell ships immediately and this
 *     streams into the reserved slot a moment later.
 *
 * The result: ONE html response, no client-side fetch, ZERO added client JS, no layout shift
 * (the skeleton reserves the exact box), and the public content stays cacheable and fully
 * indexable. Next's build output marks such a route `◐ (Partial Prerender)`.
 *
 * ⚠ It is a SERVER component. It must never become a client component, and it must never be
 * hoisted out of its <Suspense> boundary — either change silently converts every page in the
 * app to request-time rendering.
 *
 * ⚠ It reads the session for DISPLAY ONLY. It authorizes nothing. See lib/dal.ts.
 */
export async function UserIsland() {
  const session = await readServerSession()

  if (!session) {
    // The guest path. Note what does NOT happen here: no API call, no SDK, no client JS.
    // A visitor who never signs in pays nothing for the existence of the account system.
    return (
      <Link
        href="/sign-in"
        className="text-sm font-medium text-foreground hover:text-primary"
        data-testid="sign-in-link"
      >
        Sign in
      </Link>
    )
  }

  // Greet them by the name they gave us at registration (FR-009a) — not by the first half of their
  // email address, which is a machine's idea of a name.
  const label = session.givenName ?? "Account"

  return (
    <Link
      href="/account"
      className="text-sm font-medium text-foreground hover:text-primary"
      data-testid="account-link"
    >
      Hi, {label}
    </Link>
  )
}

/**
 * The fallback. It MUST reserve the same box the real island occupies — a skeleton that is a
 * different size than its content is a cumulative-layout-shift bug with extra steps (SC-002
 * budgets CLS at 0.05).
 */
export function UserIslandSkeleton() {
  return (
    <div
      className="h-5 w-16 animate-pulse rounded bg-muted"
      aria-hidden="true"
      data-testid="user-island-skeleton"
    />
  )
}
