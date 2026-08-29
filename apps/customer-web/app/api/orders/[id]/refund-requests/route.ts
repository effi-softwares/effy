import { proxyToCore } from "@/lib/api/proxy"

/**
 * Raise a refund request against an order (055 US3, FR-005r).
 *
 * ⚠ IT MOVES NO MONEY. A form that withdrew money on submission would let anyone refund their own
 * order by describing a problem. This records an ASK; a person decides it.
 *
 * ⚠ HOT PATH, beside the cancel route, because the deciding lives there — the refund path and its
 * gate. Splitting the ask from the answer across two services would mean two places that must agree
 * about which request is still open.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  return proxyToCore((c) =>
    c.post(`/v1/orders/${encodeURIComponent(id)}/refund-requests`, body as Record<string, unknown>),
  )
}
