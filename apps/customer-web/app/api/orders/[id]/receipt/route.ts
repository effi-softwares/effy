import { proxyToEdge } from "@/lib/api/proxy"

/** Resends a paid order's receipt (the customer service enqueues an email). No body is forwarded: the recipient comes from the session, never the caller. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return proxyToEdge((c) => c.post(`/customer/v1/orders/${encodeURIComponent(id)}/receipt`, {}))
}
