import { proxyToCore } from "@/lib/api/proxy"

/** List / create the signed-in customer's delivery addresses (US3). */
export async function GET() {
  return proxyToCore((c) => c.get("/v1/addresses"))
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  return proxyToCore((c) => c.post("/v1/addresses", body))
}
