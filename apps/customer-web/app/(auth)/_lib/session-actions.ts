"use server"

import { startSession } from "@/lib/session"

/**
 * Starts the session from the tokens the browser was just issued. A Server Action, not a route handler:
 * setting cookies here clears the router's route cache, which still holds pages the proxy redirected to
 * sign-in. Next refuses an action from another origin (login CSRF).
 */
export async function startSessionAction(tokens: {
  idToken: string
  accessToken: string
  refreshToken: string
}): Promise<"started" | "refused" | "unavailable"> {
  const { idToken, accessToken, refreshToken } = tokens ?? {}
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
