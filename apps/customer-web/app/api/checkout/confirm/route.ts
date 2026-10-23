import { proxyToEdge } from "@/lib/api/proxy"

/**
 * The idempotent confirm fallback, reachable from the client.
 *
 * The webhook is authoritative; this covers its lag. It is safe to call at any time and for any
 * order: for one still pending it reports `paid: false` and changes nothing, and for one already paid
 * it reports `paid: true` without applying anything twice.
 *
 * Uses it as the honest answer to "has this order already been paid for?" — asking the platform
 * rather than trusting a flag the client is holding.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  return proxyToEdge((c) => c.post("/commerce/v1/checkout/confirm", body))
}
