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
/**
 * ⚠ Takes the whole SESSION, not a bare token — because the privileged account routes need TWO.
 *
 * The gateway authorizes the ID token; Cognito's password APIs are authorized by the ACCESS token,
 * which the backend relays. The backend refuses a mismatched pair (012 research R12), so both must
 * come from the same session — which is exactly what passing the session object, rather than two
 * loose strings, makes impossible to get wrong.
 */
export function edgeApi(session: { idToken: string; accessToken?: string | null }) {
  return new ServerApiClient({
    baseUrl: edgeApiBaseUrl(),
    token: session.idToken,
    accessToken: session.accessToken ?? null,
  })
}

/** Account data is per-customer: it must never be cached, and never prerendered. */
export const perCustomer: RequestInit = { cache: "no-store" }
