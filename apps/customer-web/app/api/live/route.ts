import type { LiveDescriptor } from "@effy/shared-types"
import { NextResponse } from "next/server"

import { edgeApi, perCustomer } from "@/lib/api/edge"
import { getSession } from "@/lib/dal"

/**
 * Where the signed-in customer's live-update channel is, and the token to open it with (071).
 *
 * The channel tells an open order page "your orders changed" — nothing else — and the page re-reads
 * from the server exactly as it already does. It never names a shop (FR-024).
 *
 * ⚠ THIS RETURNS THE ID TOKEN TO THE PAGE, deliberately. The socket is opened by the browser, so
 * the browser must present a credential, and the only one the channel's authorizer accepts is the
 * customer's own token. It grants nothing new: Amplify's `ssr: true` mode already keeps this same
 * token in a cookie the page's own scripts can read. It is sent only to the signed-in customer, on
 * their own same-origin request, and never cached.
 *
 * 204 = no live channel for this visitor (signed out, or none in this environment). The page then
 * simply does not update by itself, as it never did before 071.
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
