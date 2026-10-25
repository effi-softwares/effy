"use server"

import { startSession } from "@/lib/session"

/**
 * The hand-over: the browser has just signed in with Cognito and gives the server its tokens, once.
 * The server verifies them and keeps them in `HttpOnly` cookies.
 *
 * A Server Action, not a route handler: setting cookies in an action makes the router drop its route
 * cache. Without that, a page the proxy redirected to sign-in while signed out (`/account` →
 * `/sign-in?next=%2Faccount`) is remembered as that redirect, and `router.replace(next)` lands back
 * on sign-in. Next also refuses an action whose `Origin` is not this site, so another site cannot post
 * its own tokens here and leave a visitor signed in to the attacker's account (login CSRF).
 *
 *  started      the session exists
 *  refused      not tokens of ours (wrong shape, not valid, not one person)
 *  unavailable  they could not be checked right now; nothing is wrong with the sign-in
 */
export type HandOverResult = "started" | "refused" | "unavailable"

export async function startSessionAction(tokens: {
  idToken: string
  accessToken: string
  refreshToken: string
}): Promise<HandOverResult> {
  // The argument arrives from the browser: its declared type is a hope, not a check.
  const { idToken, accessToken, refreshToken } = (tokens ?? {}) as Record<string, unknown>
  if (typeof idToken !== "string" || typeof accessToken !== "string" || typeof refreshToken !== "string") {
    return "refused"
  }

  try {
    return (await startSession({ idToken, accessToken, refreshToken })) ? "started" : "refused"
  } catch (err) {
    console.error("[session] could not verify a new session:", (err as Error).message)
    return "unavailable"
  }
}
