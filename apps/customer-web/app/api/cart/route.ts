import { proxyToCore } from "@/lib/api/proxy"

/**
 * Replace the server cart with EXACTLY the client's device-local cart — the idempotent checkout
 * snapshot (R8 amended → Option B: the local cart is the source of truth). Safe to call repeatedly;
 * re-entering checkout overwrites, never accumulates. The local cart is cleared only on order completion.
 */
export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({ lines: [] }))
  return proxyToCore((c) => c.put("/v1/cart", body))
}
