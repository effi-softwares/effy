import { proxyToEdge } from "@/lib/api/proxy"

/** Move a line out of the payable cart, keeping it. */
export async function POST(req: Request, { params }: { params: Promise<{ variantId: string }> }) {
  const { variantId } = await params
  const changeId = new URL(req.url).searchParams.get("changeId") ?? ""
  return proxyToEdge((c) =>
    c.post(`/commerce/v1/cart/items/${encodeURIComponent(variantId)}/set-aside?changeId=${encodeURIComponent(changeId)}`),
  )
}
