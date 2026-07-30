import { proxyToCore } from "@/lib/api/proxy"

/** Move a set-aside line back into the cart, AT ITS CURRENT PRICE (027 FR-029). */
export async function POST(req: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params
  const changeId = new URL(req.url).searchParams.get("changeId") ?? ""
  return proxyToCore((c) =>
    c.post(`/v1/cart/saved/${encodeURIComponent(productId)}/restore?changeId=${encodeURIComponent(changeId)}`),
  )
}
