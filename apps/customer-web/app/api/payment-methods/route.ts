import { proxyToCore } from "@/lib/api/proxy"

/**
 * The shopper's kept cards (051 US3/US6).
 *
 * ⚠ HOT PATH, and that is not an exception to the routing law but an application of it. 011 puts
 * *payment* on the hot path; and the Stripe secret's custody boundary settles any doubt — listing a
 * payment method is a provider call, so a cold-path route would need a second copy of the secret
 * (research R9).
 *
 * ⚠ Scoped to the authenticated subject by the server. There is no customer parameter here and there
 * must never be one.
 */
export async function GET() {
  return proxyToCore((c) => c.get("/v1/payment-methods", { cache: "no-store" }))
}
