import "server-only"

import { ServerApiClient } from "@effy/api-client"

import { edgeApiBaseUrl } from "@/lib/config"

/**
 * The COLD path (`edge-api`, serverless). THE ROUTING LAW (FR-028):
 *
 *     customer profile · account management   →   HERE
 *     commerce (product/cart/order/payment)   →   NOT HERE. Use lib/api/core.ts.
 *
 * Low-frequency account CRUD is exactly what cheap serverless is for. Latency-sensitive
 * commerce traffic is not — putting it here would be a Principle III violation, and it is
 * forbidden without a justified, recorded exception in that feature's plan.
 *
 * Everything reached through this client is PER-CUSTOMER and therefore NEVER cached.
 */
export function edgeApi(token: string) {
  return new ServerApiClient({ baseUrl: edgeApiBaseUrl(), token })
}

/** Account data is per-customer: it must never be cached, and never prerendered. */
export const perCustomer: RequestInit = { cache: "no-store" }
