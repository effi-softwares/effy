import { proxyToEdge } from "@/lib/api/proxy"

/**
 * Add or INCREMENT a line (027). The one non-idempotent cart write, which is why the body must carry a
 * `changeId`: a retry after an ambiguous failure must not add the item twice (FR-018). The platform
 * refuses the request without one.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  return proxyToEdge((c) => c.post("/commerce/v1/cart/items", body))
}
