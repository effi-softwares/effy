import { proxyToCore } from "@/lib/api/proxy"

type Params = { params: Promise<{ productId: string }> }

/**
 * Set an ABSOLUTE line quantity; 0 removes (027). Absolute rather than a delta is what makes the client's
 * per-line debounce safe: intermediate values can simply be dropped (FR-016).
 */
export async function PATCH(req: Request, { params }: Params) {
  const { productId } = await params
  const body = await req.json().catch(() => ({}))
  return proxyToCore((c) => c.patch(`/v1/cart/items/${encodeURIComponent(productId)}`, body))
}

export async function DELETE(req: Request, { params }: Params) {
  const { productId } = await params
  const changeId = new URL(req.url).searchParams.get("changeId") ?? ""
  return proxyToCore((c) =>
    c.delete(`/v1/cart/items/${encodeURIComponent(productId)}?changeId=${encodeURIComponent(changeId)}`),
  )
}
