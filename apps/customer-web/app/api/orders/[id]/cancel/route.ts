import { proxyToCore } from "@/lib/api/proxy"

/**
 * Cancel an order (055 US2, FR-012).
 *
 * ⚠ HOT PATH, unlike the receipt resend beside it — and the reason is not the routing law's usual
 * read/write split. Cancelling MOVES MONEY, and the payment secret lives in `core-api` and nowhere
 * else (019 SC-012). The cold path could only do this by holding the secret too, or by forwarding
 * this customer's token to another service — the auth-brokering Principle IV forbids by name
 * (055 research R1).
 *
 * ⚠ NO BODY. There is nothing for the caller to say: which order is in the path, who they are comes
 * from the session, and the amount is the platform's arithmetic. A field here would be a field
 * somebody could use to redirect somebody else's money.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return proxyToCore((c) => c.post(`/v1/orders/${encodeURIComponent(id)}/cancel`, {}))
}
