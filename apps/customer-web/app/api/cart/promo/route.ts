import { proxyToCore } from "@/lib/api/proxy"

/** Apply a promotional code (027 FR-041). Validated entirely by the platform (FR-042). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  return proxyToCore((c) => c.post("/v1/cart/promo", body))
}

/** Remove the applied code. Idempotent — removing nothing is not an error. */
export async function DELETE() {
  return proxyToCore((c) => c.delete("/v1/cart/promo"))
}
