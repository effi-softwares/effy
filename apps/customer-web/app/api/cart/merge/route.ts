import { proxyToCore } from "@/lib/api/proxy"

/** Merge the device-local guest cart into the server cart on sign-in (US3). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({ lines: [] }))
  return proxyToCore((c) => c.post("/v1/cart/merge", body))
}
