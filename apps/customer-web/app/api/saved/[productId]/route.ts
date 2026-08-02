import { proxyToCore } from "@/lib/api/proxy"

/**
 * Save / un-save one product (033).
 *
 * ⚠ Uses the shared `proxyToCore` helper rather than a hand-rolled `forward()`. The predecessor's
 * route rolled its own session read and error mapping, which is how it drifted from every other
 * proxy route in the app.
 *
 * `proxyToCore` maps 403 → 401 (a refused session becomes deferred sign-in) and forwards every other
 * 4xx untouched — so the client can still distinguish a 404 (no such product) from a 422 (cap
 * reached), which are different things to tell a shopper.
 */
export async function PUT(_req: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params
  return proxyToCore((c) => c.put(`/v1/saved/${encodeURIComponent(productId)}`, {}))
}

/** ⚠ Always succeeds when the membership is absent — un-saving something not saved is a no-op. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params
  return proxyToCore((c) => c.delete(`/v1/saved/${encodeURIComponent(productId)}`))
}
