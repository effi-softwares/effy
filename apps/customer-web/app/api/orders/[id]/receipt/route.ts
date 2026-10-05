import { proxyToEdge } from "@/lib/api/proxy"

/**
 * Resend a paid order's receipt (052 US4, FR-027).
 *
 * On the customer service: its entire job is to enqueue an email — exactly 046's feedback-reply
 * shape — and it touches no payment.
 *
 * ⚠ NO BODY IS FORWARDED. The recipient is resolved server-side from the authenticated subject; an
 * `email` supplied by a caller would turn this into an open relay for a personalised document.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return proxyToEdge((c) => c.post(`/customer/v1/orders/${encodeURIComponent(id)}/receipt`, {}))
}
