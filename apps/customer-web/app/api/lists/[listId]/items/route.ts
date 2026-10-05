import { proxyToEdge } from "@/lib/api/proxy"

/** One list's products, newest first (068). `default` is the shopper's "Saved" list. */
export async function GET(_req: Request, { params }: { params: Promise<{ listId: string }> }) {
  const { listId } = await params
  return proxyToEdge((c) => c.get(`/commerce/v1/lists/${encodeURIComponent(listId)}/items`))
}
