import { proxyToEdge } from "@/lib/api/proxy"

/**
 * Cancel an order (055 US2, FR-012).
 *
 * ⚠ Cancelling MOVES MONEY — it is a full refund. It goes to the commerce service, where checkout
 * and payment live.
 *
 * ⚠ NO BODY. There is nothing for the caller to say: which order is in the path, who they are comes
 * from the session, and the amount is the platform's arithmetic. A field here would be a field
 * somebody could use to redirect somebody else's money.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return proxyToEdge((c) => c.post(`/commerce/v1/orders/${encodeURIComponent(id)}/cancel`, {}))
}
