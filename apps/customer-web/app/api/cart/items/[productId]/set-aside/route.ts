import { proxyToEdge } from "@/lib/api/proxy"

/** Move a line out of the payable cart, keeping it (027 FR-028). */
export async function POST(req: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params
  const changeId = new URL(req.url).searchParams.get("changeId") ?? ""
  return proxyToEdge((c) =>
    c.post(`/commerce/v1/cart/items/${encodeURIComponent(productId)}/set-aside?changeId=${encodeURIComponent(changeId)}`),
  )
}
