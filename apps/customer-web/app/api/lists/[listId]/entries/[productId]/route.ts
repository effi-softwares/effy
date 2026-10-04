import { proxyToCore } from "@/lib/api/proxy"

type Ctx = { params: Promise<{ listId: string; productId: string }> }

const path = (listId: string, productId: string) =>
  `/v1/lists/${encodeURIComponent(listId)}/entries/${encodeURIComponent(productId)}`

/**
 * Place a product in a list (068). Idempotent.
 *
 * ⚠ The body is FORWARDED. It carries `restoreAddedAt`, which is how undo puts a product back where
 * it was in the list rather than at the top.
 */
export async function PUT(req: Request, { params }: Ctx) {
  const { listId, productId } = await params
  const body = await req.json().catch(() => ({}))
  return proxyToCore((c) => c.put(path(listId, productId), body))
}

/** Take a product out of THIS list only. Never refused: the shopper named the list. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { listId, productId } = await params
  return proxyToCore((c) => c.delete(path(listId, productId)))
}
