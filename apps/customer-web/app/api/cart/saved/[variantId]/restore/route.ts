import { proxyToEdge } from "@/lib/api/proxy"

/** Move a set-aside line back into the cart, AT ITS CURRENT PRICE (027 FR-029). */
export async function POST(req: Request, { params }: { params: Promise<{ variantId: string }> }) {
  const { variantId } = await params
  const changeId = new URL(req.url).searchParams.get("changeId") ?? ""
  return proxyToEdge((c) =>
    c.post(`/commerce/v1/cart/saved/${encodeURIComponent(variantId)}/restore?changeId=${encodeURIComponent(changeId)}`),
  )
}
