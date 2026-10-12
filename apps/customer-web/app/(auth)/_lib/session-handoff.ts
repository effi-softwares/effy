"use client"

/**
 * The hand-over: give the server the tokens Cognito just issued, and keep none of them here.
 *
 * ⚠ THE BROWSER'S COPY IS REMOVED BEFORE THE REQUEST IS EVEN SENT. Whatever the server answers, no
 * token is left where a script could read it — and the SDK never finds a "leftover" sign-in that
 * would make it refuse the next attempt.
 *
 * ⚠ `true` MEANS THE SERVER HAS THE SESSION. The sign-in screens navigate only on `true`; on `false`
 * they say so and the customer tries again. A sign-in that Cognito accepted but the server did not
 * must never look like success.
 */
const PREFIX = "CognitoIdentityServiceProvider."

export async function handOverSession(): Promise<boolean> {
  const stored = takeStoredTokens()
  if (!stored) return false
  try {
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(stored),
    })
    if (!res.ok) console.warn(`[auth] session hand-over refused: ${res.status}`)
    return res.ok
  } catch {
    console.warn("[auth] session hand-over failed: network")
    return false
  }
}

/** Read the three tokens the SDK stored for this tab, and remove everything it stored. */
function takeStoredTokens(): { idToken: string; accessToken: string; refreshToken: string } | null {
  const store = window.sessionStorage
  const keys = Object.keys(store).filter((k) => k.startsWith(PREFIX))
  const ending = (suffix: string) => {
    const key = keys.find((k) => k.endsWith(suffix))
    return key ? store.getItem(key) : null
  }
  const idToken = ending(".idToken")
  const accessToken = ending(".accessToken")
  const refreshToken = ending(".refreshToken")
  for (const key of keys) store.removeItem(key)
  return idToken && accessToken && refreshToken ? { idToken, accessToken, refreshToken } : null
}

export const HAND_OVER_FAILED =
  "You're signed in, but we couldn't start your session. Please try again in a moment."
