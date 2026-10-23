import type { LiveDescriptor } from "@effy/shared-types"
import { NextResponse } from "next/server"

import { edgeApi, perCustomer } from "@/lib/api/edge"
import { getSession } from "@/lib/dal"

/**
 * Where the signed-in customer's live channel is, and the token to open it with: the browser opens the
 * socket, so it must present the customer's own ID token. The one place a token reaches page script (the
 * session cookies are `HttpOnly`): the hour-long ID token only, never the refresh token, uncached. 204:
 * no channel for this visitor; the page then does not update by itself.
 */
export async function GET() {
  const session = await getSession()
  if (!session) return new NextResponse(null, { status: 204 })

  let descriptor: LiveDescriptor | undefined
  try {
    descriptor = await edgeApi(session).get<LiveDescriptor | undefined>("/customer/v1/live", perCustomer)
  } catch (err) {
    const status = (err as { status?: number }).status ?? 502
    // Refused, or a backend that predates the route: there is no channel. Anything else is a
    // failure to find out, which the client retries.
    if (status >= 400 && status < 500) return new NextResponse(null, { status: 204 })
    return NextResponse.json({ error: "unavailable" }, { status: 502 })
  }
  if (!descriptor) return new NextResponse(null, { status: 204 })

  return NextResponse.json({ descriptor, token: session.idToken }, { headers: { "cache-control": "no-store" } })
}
