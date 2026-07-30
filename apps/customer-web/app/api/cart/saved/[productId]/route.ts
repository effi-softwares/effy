import { proxyToCore } from "@/lib/api/proxy"

/** Discard a set-aside line outright. */
export async function DELETE(req: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params
  const changeId = new URL(req.url).searchParams.get("changeId") ?? ""
  return proxyToCore((c) =>
    c.delete(`/v1/cart/saved/${encodeURIComponent(productId)}?changeId=${encodeURIComponent(changeId)}`),
  )
}
