import { proxyToEdge } from "@/lib/api/proxy"

/** Discard a set-aside line outright. */
export async function DELETE(req: Request, { params }: { params: Promise<{ variantId: string }> }) {
  const { variantId } = await params
  const changeId = new URL(req.url).searchParams.get("changeId") ?? ""
  return proxyToEdge((c) =>
    c.delete(`/commerce/v1/cart/saved/${encodeURIComponent(variantId)}?changeId=${encodeURIComponent(changeId)}`),
  )
}
