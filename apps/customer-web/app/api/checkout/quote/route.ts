import { proxyToCore } from "@/lib/api/proxy"

/**
 * Per-package delivery quote for the signed-in customer (021 US1). Proxies to the hot path, which
 * groups the cart by fulfilling shop into ANONYMOUS packages, resolves each package's zone leg to the
 * address, prices its methods, and captures the quote server-side with a validity window. The client
 * never sees a shop id, name, or location, and never sends a fee (SC-004/SC-006).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  return proxyToCore((c) => c.post("/v1/checkout/quote", body))
}
