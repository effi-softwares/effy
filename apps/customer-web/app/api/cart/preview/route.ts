import { NextResponse } from "next/server"

import { edgeApiPublic, uncached } from "@/lib/api/edge"

/**
 * Re-price a GUEST's device cart (027, research R10). PUBLIC on purpose and writes nothing.
 *
 * A guest has no account cart, but FR-004 (a restored cart shows current prices), FR-021 and FR-022
 * (honest price and availability) apply to them just as much. So their device lines are priced by the
 * platform here rather than by duplicating pricing logic in the browser.
 *
 * ⚠ Deliberately NOT via `proxyToEdge`: that helper requires a session and would 401 the very audience
 * this route exists for. It is also `uncached()` — the answer depends on the request body, and caching a
 * per-cart re-price would serve one guest another's prices.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({ lines: [] }))
  try {
    return NextResponse.json(await edgeApiPublic().post("/commerce/v1/cart/preview", body, uncached()))
  } catch {
    // A preview failure must never empty or alter the shopper's cart — the client keeps what it holds.
    return NextResponse.json({ error: "unavailable" }, { status: 502 })
  }
}
