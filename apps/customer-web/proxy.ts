import { NextResponse, type NextRequest } from "next/server"

import { needsAccount } from "@/lib/account-routes"
import { refreshTokens, type FreshTokens } from "@/lib/cognito"
import { safeNextTarget } from "@/lib/next-target"
import { jwtExpiry, SESSION_COOKIES, sessionCookieOptions } from "@/lib/session-cookies"

/**
 * Runs before a request is rendered. Two jobs, both about the session cookies.
 *
 * This file is `proxy.ts`, not `middleware.ts` - Next 16 renamed it. The runtime is Node.js.
 *
 * 1. Keep the session fresh. Id and access tokens last an hour. This is the one place that swaps
 *  expired ones for new ones, because it is the one place that can both write the new cookies to
 *  the browser and hand them to the render that is about to happen. A guest has no session cookie
 *  and costs one cookie lookup; a signed-in customer costs one call to Cognito an hour.
 *
 * 2. Send a guest to sign-in early on the pages that need an account, keeping where they were going.
 *
 * This is not the authorization gate. It never verifies a token. Every protected page and Server
 * Action checks the session itself (`lib/dal.ts`, `lib/session.ts`) and the backend checks it again.
 */
/** Refresh a little early, so a token cannot expire between here and the backend. */
const EXPIRY_MARGIN_SECONDS = 60

export async function proxy(request: NextRequest) {
  const refreshToken = request.cookies.get(SESSION_COOKIES.refresh)?.value
  const expiry = jwtExpiry(request.cookies.get(SESSION_COOKIES.id)?.value)
  const current = expiry !== null && expiry - EXPIRY_MARGIN_SECONDS > Date.now() / 1000

  if (current) return NextResponse.next()

  if (refreshToken) {
    let fresh: FreshTokens | null
    try {
      fresh = await refreshTokens(refreshToken)
    } catch (err) {
      // Cognito could not be reached. The session may be fine, so nothing is cleared; the page
      // decides what to show.
      console.error("[session] could not refresh:", (err as Error).message)
      return NextResponse.next()
    }
    if (fresh) {
      // On the request, so this render sees them; on the response, so the browser keeps them.
      request.cookies.set(SESSION_COOKIES.id, fresh.idToken)
      request.cookies.set(SESSION_COOKIES.access, fresh.accessToken)
      const response = NextResponse.next({ request })
      response.cookies.set(SESSION_COOKIES.id, fresh.idToken, sessionCookieOptions())
      response.cookies.set(SESSION_COOKIES.access, fresh.accessToken, sessionCookieOptions())
      return response
    }
    // Cognito refused the refresh token: the session is over. Fall through as a guest.
  }

  const path = request.nextUrl.pathname
  const response = needsAccount(path) ? NextResponse.redirect(signInUrl(request)) : NextResponse.next()
  if (refreshToken || expiry !== null) {
    for (const name of Object.values(SESSION_COOKIES)) response.cookies.delete(name)
  }
  return response
}

function signInUrl(request: NextRequest): URL {
  const url = new URL("/sign-in", request.url)
  // Validated: it becomes a redirect target, and the path is attacker-controlled.
  url.searchParams.set("next", safeNextTarget(request.nextUrl.pathname + request.nextUrl.search))
  return url
}

/**
 * Pages, Server Actions and our own `/api` routes. Not build assets, not files, not the analytics
 * relay (`/rc`).
 */
export const config = {
  matcher: ["/((?!_next/|rc/|.*\\.[\\w]+$).*)"],
}
