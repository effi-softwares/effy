import { NextResponse } from "next/server"

import { edgeApiPublic, uncached } from "@/lib/api/edge"

/**
 * Re-prices a guest's device cart; public, and writes nothing, so guests see current prices and
 * availability priced by the platform. Not `proxyToEdge` (it requires a session), and uncached (the
 * answer depends on the body).
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
