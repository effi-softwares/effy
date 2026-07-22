import "server-only"

import type { ServerApiClient } from "@effy/api-client"
import { NextResponse } from "next/server"

import { getSession } from "@/lib/dal"

import { coreApi } from "./core"
import { edgeApi } from "./edge"

function relay(data: unknown): Response {
  return data === undefined ? new NextResponse(null, { status: 204 }) : NextResponse.json(data)
}

function relayError(err: unknown): Response {
  const e = err as { status?: number; detail?: string; title?: string }
  const status = e.status ?? 502
  if (status >= 400 && status < 500) {
    // 403 → 401 turns a refused session into deferred sign-in; every other 4xx (404 not-found, 409
    // the delete-default guard) forwards its status untouched so the client can map it.
    return NextResponse.json(
      { error: e.detail ?? e.title ?? "request failed" },
      { status: status === 403 ? 401 : status },
    )
  }
  return NextResponse.json({ error: "unavailable" }, { status: 502 })
}

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
    return relay(await run(coreApi(session.accessToken)))
  } catch (err) {
    return relayError(err)
  }
}

/**
 * The same, on the COLD path (edge-api). Customer profile/account management — the address book
 * (022) — lives here per the routing law (011 FR-028). The gateway authorizes the customer's ID
 * token (which `edgeApi` sends); a guest → 401.
 */
export async function proxyToEdge(run: (client: ServerApiClient) => Promise<unknown>): Promise<Response> {
  const session = await getSession()
  if (!session?.idToken) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 })
  }
  try {
    return relay(await run(edgeApi(session)))
  } catch (err) {
    return relayError(err)
  }
}
