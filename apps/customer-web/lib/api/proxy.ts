import "server-only"

import type { ServerApiClient } from "@effy/api-client"
import { NextResponse } from "next/server"

import { getSession } from "@/lib/dal"

import { coreApi } from "./core"

/**
 * Runs an authenticated core-api call on behalf of the signed-in customer (US3). Lives OUTSIDE the
 * `(shop)` public tree so reading the session (Amplify SDK) never leaks into the storefront bundle.
 * core-api authorizes with the customer's ACCESS token. A guest → 401 (the client turns it into
 * deferred sign-in); a 4xx forwards its problem detail; anything else → 502.
 */
export async function proxyToCore(run: (client: ServerApiClient) => Promise<unknown>): Promise<Response> {
  const session = await getSession()
  if (!session?.accessToken) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 })
  }
  try {
    const data = await run(coreApi(session.accessToken))
    return data === undefined ? new NextResponse(null, { status: 204 }) : NextResponse.json(data)
  } catch (err) {
    const e = err as { status?: number; detail?: string; title?: string }
    const status = e.status ?? 502
    if (status >= 400 && status < 500) {
      return NextResponse.json(
        { error: e.detail ?? e.title ?? "request failed" },
        { status: status === 403 ? 401 : status },
      )
    }
    return NextResponse.json({ error: "unavailable" }, { status: 502 })
  }
}
