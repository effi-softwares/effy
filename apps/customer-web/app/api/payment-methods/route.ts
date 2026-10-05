import { proxyToEdge } from "@/lib/api/proxy"

/**
 * The shopper's kept cards (051 US3/US6).
 *
 * ⚠ On the commerce service, with checkout: listing a payment method is a call to the payment
 * provider, and the provider secret has one custodian among the shopper-facing services.
 *
 * ⚠ Scoped to the authenticated subject by the server. There is no customer parameter here and there
 * must never be one.
 */
export async function GET() {
  return proxyToEdge((c) => c.get("/commerce/v1/payment-methods", { cache: "no-store" }))
}
