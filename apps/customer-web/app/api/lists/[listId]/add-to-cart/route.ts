import { proxyToEdge } from "@/lib/api/proxy"

/**
 * Add every purchasable product in one list to the cart — the weekly-shop action.
 *
 * The server decides what is purchasable, as for the saved list: everything it could
 * not add comes back named, with a reason.
 */
export async function POST(req: Request, { params }: { params: Promise<{ listId: string }> }) {
  const { listId } = await params
  const body = await req.json().catch(() => ({}))
  return proxyToEdge((c) => c.post(`/commerce/v1/lists/${encodeURIComponent(listId)}/add-to-cart`, body))
}
