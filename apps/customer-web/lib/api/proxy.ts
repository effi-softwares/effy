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
  const e = err as { status?: number; detail?: string; title?: string; type?: string; code?: string }
  const status = e.status ?? 502
  if (status >= 400 && status < 500) {
    // 403 → 401 turns a refused session into deferred sign-in; every other 4xx (404 not-found, 409
    // the delete-default guard) forwards its status untouched so the client can map it.
    return NextResponse.json(
      // `code` (069) is the refusal the ROUTE named — the checkout's slot/date refusals. `undefined`
      // drops out of the JSON, so every other caller sees the body it always saw.
      { error: e.detail ?? e.title ?? "request failed", reason: refusalReason(e.type), code: e.code },
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
/**
 * The stable reason a refusal carries: the last segment of the problem's `type`, in the contract's
 * own spelling (`…/problems/name-taken` → `name_taken`).
 *
 * ⚠ Two 400s from one route can mean different things (068: `invalid_name` vs `list_limit`), and
 * `error` is the service's prose — fine to log, wrong to switch on. `undefined` drops out of the
 * JSON, so every existing caller sees the body it always saw.
 */
function refusalReason(type: string | undefined): string | undefined {
  const last = type?.split("/").pop()
  return last ? last.replaceAll("-", "_") : undefined
}

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
