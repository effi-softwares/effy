import { proxyToEdge } from "@/lib/api/proxy"

/**
 * Save / un-save one product (033).
 *
 * ⚠ Uses the shared `proxyToEdge` helper rather than a hand-rolled `forward()`. The predecessor's
 * route rolled its own session read and error mapping, which is how it drifted from every other
 * proxy route in the app.
 *
 * `proxyToEdge` maps 403 → 401 (a refused session becomes deferred sign-in) and forwards every other
 * 4xx untouched — so the client can still distinguish a 404 (no such product) from a 422 (cap
 * reached), which are different things to tell a shopper.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params
  // 098 — the body may name the size the shopper had chosen (`SaveItemRequest.variantId`); the
  // platform remembers it. An empty body saves the product alone, exactly as before.
  const body = await req.json().catch(() => ({}))
  return proxyToEdge((c) => c.put(`/commerce/v1/saved/${encodeURIComponent(productId)}`, body))
}

/** ⚠ Always succeeds when the membership is absent — un-saving something not saved is a no-op. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params
  return proxyToEdge((c) => c.delete(`/commerce/v1/saved/${encodeURIComponent(productId)}`))
}
