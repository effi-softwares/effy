import { proxyToCore } from "@/lib/api/proxy"

/** Put a past order's items back in the cart, reporting what could not come back (027 FR-034/FR-035). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  return proxyToCore((c) => c.post("/v1/cart/reorder", body))
}
