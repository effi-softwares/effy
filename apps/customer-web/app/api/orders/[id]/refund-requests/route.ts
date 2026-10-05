import { proxyToEdge } from "@/lib/api/proxy"

/**
 * Raise a refund request against an order (055 US3, FR-005r).
 *
 * ⚠ IT MOVES NO MONEY. A form that withdrew money on submission would let anyone refund their own
 * order by describing a problem. This records an ASK; a person decides it.
 *
 * On the commerce service, beside the cancel route.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  return proxyToEdge((c) =>
    c.post(`/commerce/v1/orders/${encodeURIComponent(id)}/refund-requests`, body as Record<string, unknown>),
  )
}
