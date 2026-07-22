import { proxyToEdge } from "@/lib/api/proxy"

/**
 * List / create the signed-in customer's delivery addresses (022 US1/US2).
 *
 * Address management is customer-profile capability → the COLD path (edge-api/customer), per the
 * routing law (011 FR-028). Forwards to `/customer/v1/addresses`.
 */
export async function GET() {
  return proxyToEdge((c) => c.get("/customer/v1/addresses"))
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  return proxyToEdge((c) => c.post("/customer/v1/addresses", body))
}
