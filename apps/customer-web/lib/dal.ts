import "server-only"

import { cache } from "react"
import { redirect } from "next/navigation"
import type { CustomerDTO } from "@effy/shared-types"

import { edgeApi, perCustomer } from "@/lib/api/edge"
import { getSession } from "@/lib/session"

/**
 * The data access layer — the authoritative authorization boundary.
 *
 * Next.js's own authentication guide is unambiguous about where auth checks belong, and it is not
 * where most people put them:
 *
 *  "While Proxy can be useful for initial checks, it should not be your only line of defense in
 *  protecting your data. The majority of security checks should be performed as close as possible
 *  to your data source."
 *
 *  "Always verify authentication and authorization inside each server function rather than relying
 *  on Proxy alone."
 *
 * And it warns specifically against the intuitive alternative:
 *
 *  "Due to Partial Rendering, be cautious when doing checks in layouts as these don't re-render on
 *  navigation, meaning the user session won't be checked on every route change."
 *
 * So the model is two-tier, and the split is deliberate:
 *
 *  • `proxy.ts` — optimistic. Keeps the session cookies fresh and redirects a guest early,
 *  keeping their destination. It verifies nothing: a UX affordance, not a gate.
 *  • This file — authoritative. Verifies the session and consults the platform's own customer
 *  record, because a valid token is not permission: a barred customer holds a
 *  perfectly valid token and must still be refused.
 *
 * Every protected page, Server Action, and Route Handler calls `requireCustomer`. Server Actions
 * are treated as public endpoints, because that is exactly what they are — a POST anyone can craft.
 */

// The session read itself lives in lib/session.ts; re-exported because this is where pages look for it.
export { getSession, type Session } from "@/lib/session"

/**
 * The customer, as the platform sees them — or a redirect to sign-in.
 *
 * This does not trust the token beyond identity. It calls the backend, which upserts the record
 * and enforces `status`. A barred customer gets a 403 here and is signed out of the experience,
 * holding a credential that is, technically, impeccable.
 *
 * `next` carries their destination so authenticating does not cost them their place.
 */
export const requireCustomer = cache(
  async (intendedPath: string): Promise<CustomerDTO> => {
    const session = await getSession()
    if (!session) {
      redirect(`/sign-in?next=${encodeURIComponent(intendedPath)}`)
    }

    try {
      return await edgeApi(session).get<CustomerDTO>("/customer/v1/me", perCustomer)
    } catch {
      // A 403 (barred) or an unreachable backend both land here. We do not distinguish them to the
      // customer: telling someone "your account is barred" is an information leak they cannot act
      // on, and telling them "we're broken" when they are barred would be a lie.
      redirect("/account/unavailable")
    }
  },
)
