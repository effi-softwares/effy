import { NextResponse } from "next/server"

import { cached, coreApi } from "@/lib/api/core"

/**
 * The platform's order rules — the minimum spend and the two cart ceilings (027 FR-053/FR-037/FR-038).
 *
 * PUBLIC, because a guest cart must gate and explain from the same numbers the platform enforces, and a
 * guest has no account cart to read them from. This IS cacheable: it is identical for every shopper.
 */
export async function GET() {
  try {
    return NextResponse.json(
      await coreApi().get("/v1/cart/policy", cached({ tags: ["order-policy"], revalidate: 300 })),
    )
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 })
  }
}
