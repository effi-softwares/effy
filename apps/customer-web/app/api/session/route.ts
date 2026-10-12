import { NextResponse } from "next/server"

import { siteUrl } from "@/lib/config"
import { startSession } from "@/lib/session"

/**
 * The hand-over: the browser has just signed in with Cognito and gives the server its tokens, once.
 *
 * The server verifies them and keeps them in `HttpOnly` cookies. The answer is also the sign-in
 * screen's confirmation that the SERVER accepts the session — it never navigates on hope.
 *
 *   204 — session started
 *   400 — not a request we accept (wrong origin, wrong shape)
 *   401 — the tokens are not valid tokens of ours
 *   503 — they could not be checked right now; nothing is wrong with the sign-in
 */
export async function POST(request: Request): Promise<NextResponse> {
  // ⚠ SAME-ORIGIN ONLY. Without this, another site could post ITS OWN tokens here and leave a
  // visitor signed in to the attacker's account (login CSRF).
  if (request.headers.get("origin") !== new URL(siteUrl()).origin) {
    return new NextResponse(null, { status: 400 })
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const { idToken, accessToken, refreshToken } = body ?? {}
  if (typeof idToken !== "string" || typeof accessToken !== "string" || typeof refreshToken !== "string") {
    return new NextResponse(null, { status: 400 })
  }

  try {
    const started = await startSession({ idToken, accessToken, refreshToken })
    return new NextResponse(null, { status: started ? 204 : 401 })
  } catch (err) {
    console.error("[session] could not verify a new session:", (err as Error).message)
    return new NextResponse(null, { status: 503 })
  }
}
