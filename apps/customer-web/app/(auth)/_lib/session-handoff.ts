"use client"

/**
 * Hands the tokens Cognito just issued to the server and keeps none: the browser's copy is removed before
 * the request is sent. `true` means the server has the session; the screens navigate only then.
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

/**
 * Leaves the auth pages for `next` once the session is the server's: waits for the sign-in's own work
 * (the cart and saved merges write this browser's storage), then loads the page in full. Not
 * `router.replace` + `router.refresh`: on mobile Chrome that left the shopper on the code step,
 * signed in, until a manual reload. A full load also renders every island as signed in.
 */
export async function enterSignedIn(next: string, work: Promise<unknown>[] = []): Promise<void> {
  await Promise.allSettled(work)
  // `replace`: the sign-in page must not stay in the back history.
  window.location.replace(next)
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
