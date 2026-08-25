import { proxyToCore } from "@/lib/api/proxy"

/**
 * The idempotent confirm fallback (019 R4), reachable from the client (051 FR-042).
 *
 * ⚠ The webhook is AUTHORITATIVE; this covers its lag. It is safe to call at any time and for any
 * order: for one still pending it reports `paid: false` and changes nothing, and for one already paid
 * it reports `paid: true` without applying anything twice.
 *
 * 051 uses it as the honest answer to "has this order already been paid for?" — asking the platform
 * rather than trusting a flag the client is holding.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  return proxyToCore((c) => c.post("/v1/checkout/confirm", body))
}
