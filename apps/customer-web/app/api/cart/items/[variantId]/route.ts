import { proxyToEdge } from "@/lib/api/proxy"

type Params = { params: Promise<{ variantId: string }> }

/**
 * Set an absolute line quantity; 0 removes. Absolute rather than a delta is what makes the client's
 * per-line debounce safe: intermediate values can simply be dropped.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { variantId } = await params
  const body = await req.json().catch(() => ({}))
  return proxyToEdge((c) => c.patch(`/commerce/v1/cart/items/${encodeURIComponent(variantId)}`, body))
}

export async function DELETE(req: Request, { params }: Params) {
  const { variantId } = await params
  const changeId = new URL(req.url).searchParams.get("changeId") ?? ""
  return proxyToEdge((c) =>
    c.delete(`/commerce/v1/cart/items/${encodeURIComponent(variantId)}?changeId=${encodeURIComponent(changeId)}`),
  )
}
