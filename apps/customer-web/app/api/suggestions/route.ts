import { NextResponse } from "next/server"
import type { SuggestionsDTO } from "@effy/shared-types"

import { edgeApiPublic } from "@/lib/api/edge"

const EMPTY: SuggestionsDTO = { phrases: [], products: [] }

/**
 * Search suggestions for the header field, relayed from the storefront service. Public.
 *
 * It never fails the field. Whatever goes wrong upstream, the answer is "no suggestions" and the
 * search box carries on as a plain search box.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 64)
  if (q.length < 2) return NextResponse.json(EMPTY)
  try {
    const found = await edgeApiPublic().get<SuggestionsDTO>(
      `/storefront/v1/suggestions?q=${encodeURIComponent(q)}`,
      { next: { revalidate: 60 } } as RequestInit,
    )
    return NextResponse.json(found, { headers: { "cache-control": "public, max-age=60" } })
  } catch {
    return NextResponse.json(EMPTY)
  }
}
