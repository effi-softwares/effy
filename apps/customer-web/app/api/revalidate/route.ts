import { revalidateTag } from "next/cache"
import { NextResponse } from "next/server"

import { HOME_LAYOUT_TAG } from "@/lib/cache-tags"
import { revalidateSecret } from "@/lib/config"

/**
 * Cache invalidation, called by the back office when an operator publishes or reverts the home
 * layout (042, FR-015a).
 *
 * ⚠ WITHOUT THIS ROUTE THE FEATURE APPEARS TO WORK AND DOES NOT. The storefront reads the published
 * structure through a cached path so the public home page can still prerender; nothing about that
 * read notices a publish. An operator would change the page, be told it succeeded, and shoppers would
 * keep seeing the old one until the revalidate interval expired up to an hour later — with no error
 * anywhere and nothing to look at.
 *
 * ⚠ IT IS DELIBERATELY NOT A NEXT.JS "ON-DEMAND ISR" CONVENIENCE. It is a real authorization
 * boundary: this endpoint is reachable from the public internet, and an unauthenticated one is a
 * free cache-flush primitive against the platform's only public surface — every request thereafter
 * paying a Sydney round trip.
 */

/** The tags this route is willing to invalidate. A closed set — never a caller-supplied tag. */
const INVALIDATABLE = new Set<string>([HOME_LAYOUT_TAG])

export async function POST(request: Request): Promise<NextResponse> {
  // ⚠ Read the secret FIRST, so a misconfigured deployment fails on the first call rather than
  // silently accepting whatever a caller sends. `revalidateSecret()` throws when it is unset.
  let expected: string
  try {
    expected = revalidateSecret()
  } catch {
    // ⚠ 500, not 401. "This deployment cannot check the secret" and "your secret is wrong" are
    // different problems with different fixes, and collapsing them sends the operator hunting for a
    // credential that was never the issue.
    return NextResponse.json({ error: "revalidation is not configured" }, { status: 500 })
  }

  const presented = request.headers.get("x-revalidate-secret")
  if (!presented || !safeEqual(presented, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let tag: unknown
  try {
    tag = ((await request.json()) as { tag?: unknown })?.tag
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 })
  }

  // ⚠ The tag is checked against a closed set rather than passed through. An arbitrary tag would let
  // an authenticated caller invalidate any cache on the surface, and the blast radius of a leaked
  // secret should be one page, not the whole storefront.
  if (typeof tag !== "string" || !INVALIDATABLE.has(tag)) {
    return NextResponse.json({ error: "unknown tag" }, { status: 400 })
  }

  // ⚠ The second argument is Next 16's cache profile, and `{ expire: 0 }` is what makes this a purge
  // rather than a hint. A longer profile would leave entries served until they aged past it — which
  // is the behaviour this route exists to avoid.
  revalidateTag(tag, { expire: 0 })
  return NextResponse.json({ revalidated: tag })
}

/**
 * Constant-time comparison.
 *
 * ⚠ `===` on a secret leaks its length and its matching prefix through timing. That is a marginal
 * attack over the public internet and it costs four lines to remove, which is a trade with only one
 * sensible answer. Implemented by hand rather than with `crypto.timingSafeEqual` because that
 * requires equal-length buffers — passing unequal ones throws, which would itself be an oracle.
 */
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i % b.length)
  }
  return diff === 0
}
