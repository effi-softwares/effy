import { NextResponse, type NextRequest } from "next/server"

import { safeNextTarget } from "@/lib/next-target"

/**
 * THE OPTIMISTIC GUARD (FR-022).
 *
 * ⚠ This file is `proxy.ts`, not `middleware.ts`. Next 16 renamed it — "to clarify network boundary
 * and routing focus" — and the runtime is **Node.js and cannot be configured**; setting `runtime`
 * here throws. If you came looking for `middleware.ts`, this is it.
 *
 * ⚠⚠ THIS IS NOT AN AUTHORIZATION GATE, AND IT MUST NOT BECOME ONE. ⚠⚠
 *
 * It does exactly one thing: notices there is no session cookie and redirects to sign-in early,
 * preserving where the customer was going. That is a UX affordance — it saves a wasted round trip
 * and a flash of an empty account page.
 *
 * The REAL check is `lib/dal.ts`, called by every protected page and Server Action. Next's own
 * guide says why:
 *
 *   "While Proxy can be useful for initial checks, it should not be your only line of defense in
 *    protecting your data."
 *   "Always verify authentication and authorization inside each Server Function rather than relying
 *    on Proxy alone."
 *
 * The reason is concrete, not theoretical: Server Actions are POSTs to the route they live on, so a
 * change to the matcher below can silently drop coverage from an endpoint that is still reachable.
 * A guard whose coverage is defined by a regex is a guard with a hole waiting to be opened.
 *
 * It also does NO network and NO database work — it runs on every matched request including
 * prefetches, and a DB call here would be a performance disaster and a self-inflicted DoS.
 */
export function proxy(request: NextRequest) {
  // Presence only. We do not decode, and we certainly do not trust — an attacker can set a cookie.
  // A forged cookie buys them the ability to reach a page that will then refuse them properly.
  const hasSession = request.cookies
    .getAll()
    .some((c) => /^CognitoIdentityServiceProvider\..+\.idToken$/.test(c.name))

  if (hasSession) return NextResponse.next()

  const url = new URL("/sign-in", request.url)
  // Carry the destination so signing in does not cost the customer their place (FR-020) — and
  // validate it, because it becomes a redirect target and this parameter is attacker-controlled.
  url.searchParams.set(
    "next",
    safeNextTarget(request.nextUrl.pathname + request.nextUrl.search),
  )
  return NextResponse.redirect(url)
}

/**
 * An ALLOWLIST of protected segments. Guest routes never run this — which is the point: the public
 * storefront must not pay for the account system, not even one cookie read.
 */
export const config = {
  matcher: ["/account/:path*", "/checkout/:path*", "/orders/:path*", "/favorites/:path*"],
}
