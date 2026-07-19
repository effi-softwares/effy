import { NextResponse } from "next/server"

import { coreApi } from "@/lib/api/core"
import { getSession } from "@/lib/dal"

/**
 * Authenticated favorite proxy (US2). Lives OUTSIDE the `(shop)` public tree so reading the session
 * (Amplify SDK, via `getSession`) never leaks into the storefront bundle (FR-006 quarantine). The
 * client calls this with a plain `fetch` (a string URL — no import edge).
 *
 * Favorites are commerce → the hot path (`core-api`, FR-035). core-api authorizes with the customer's
 * ACCESS token (its verifier requires `token_use=access`). A guest → 401, which the client turns into
 * deferred sign-in.
 */

async function forward(method: "PUT" | "DELETE", productId: string): Promise<Response> {
  const session = await getSession()
  if (!session?.accessToken) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 })
  }
  const client = coreApi(session.accessToken)
  const path = `/v1/favorites/${encodeURIComponent(productId)}`
  try {
    if (method === "PUT") {
      await client.put(path)
    } else {
      await client.delete(path)
    }
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    // Map core-api failures without leaking internals; a missing product → 404, else 502.
    const status = (err as { status?: number }).status
    if (status === 404) return NextResponse.json({ error: "not found" }, { status: 404 })
    if (status === 401 || status === 403) return NextResponse.json({ error: "forbidden" }, { status: 401 })
    return NextResponse.json({ error: "unavailable" }, { status: 502 })
  }
}

export async function PUT(_req: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params
  return forward("PUT", productId)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params
  return forward("DELETE", productId)
}
