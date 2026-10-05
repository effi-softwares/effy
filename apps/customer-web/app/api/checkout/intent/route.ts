import { proxyToEdge } from "@/lib/api/proxy"

/** Create the checkout PaymentIntent for the signed-in customer (US3). Returns the clientSecret. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  return proxyToEdge((c) => c.post("/commerce/v1/checkout/intent", body))
}
