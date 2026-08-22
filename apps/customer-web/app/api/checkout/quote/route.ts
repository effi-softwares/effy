import { proxyToCore } from "@/lib/api/proxy"

/** Quote delivery for the signed-in customer's cart to a chosen address (047 US1). Returns the
 *  per-package standard options + serviceability, shown before payment. The server owns every fee. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  return proxyToCore((c) => c.post("/v1/checkout/quote", body))
}
