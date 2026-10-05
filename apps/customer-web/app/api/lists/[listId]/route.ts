import { proxyToEdge } from "@/lib/api/proxy"

type Ctx = { params: Promise<{ listId: string }> }

/** Rename one of the shopper's own lists (068). The default list answers `default_list`. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { listId } = await params
  const body = await req.json().catch(() => ({}))
  return proxyToEdge((c) => c.patch(`/commerce/v1/lists/${encodeURIComponent(listId)}`, body))
}

/** Delete a list. Products that are also in another list stay there. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { listId } = await params
  return proxyToEdge((c) => c.delete(`/commerce/v1/lists/${encodeURIComponent(listId)}`))
}
