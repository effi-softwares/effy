import { proxyToEdge } from "@/lib/api/proxy"

/** Save / un-save one product through `proxyToEdge`: 403 becomes 401 (deferred sign-in), other 4xx pass through (a 404 and a 422 say different things). */
export async function PUT(req: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params
  // The body may name the size the shopper had chosen (`SaveItemRequest.variantId`); the
  // platform remembers it. An empty body saves the product alone, exactly as before.
  const body = await req.json().catch(() => ({}))
  return proxyToEdge((c) => c.put(`/commerce/v1/saved/${encodeURIComponent(productId)}`, body))
}

/** Always succeeds when the membership is absent — un-saving something not saved is a no-op. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params
  return proxyToEdge((c) => c.delete(`/commerce/v1/saved/${encodeURIComponent(productId)}`))
}
