import { proxyToCore } from "@/lib/api/proxy"

/**
 * Fold the device cart into the account cart at sign-in (027 FR-011/FR-012).
 *
 * ⚠ Union with MAXIMUM quantity — NOT 019's original merge, which summed and tripled carts on 2026-07-23,
 * and not the replace that succeeded it. Taking the maximum loses nothing from either side and is
 * idempotent, so a retry or a second sign-in changes nothing.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({ lines: [] }))
  return proxyToCore((c) => c.post("/v1/cart/merge", body))
}
