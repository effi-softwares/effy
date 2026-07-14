import "server-only"

import { cache } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { fetchAuthSession } from "aws-amplify/auth/server"
import type { CustomerDTO } from "@effy/shared-types"

import { runWithAmplifyServerContext } from "@/lib/amplify-server"
import { edgeApi, perCustomer } from "@/lib/api/edge"

/**
 * THE DATA ACCESS LAYER — the authoritative authorization boundary (research D20).
 *
 * Next.js's own authentication guide is unambiguous about where auth checks belong, and it is not
 * where most people put them:
 *
 *   "While Proxy can be useful for initial checks, IT SHOULD NOT BE YOUR ONLY LINE OF DEFENSE in
 *    protecting your data. The majority of security checks should be performed as close as possible
 *    to your data source."
 *
 *   "Always verify authentication and authorization INSIDE EACH SERVER FUNCTION rather than relying
 *    on Proxy alone."
 *
 * And it warns specifically against the intuitive alternative:
 *
 *   "Due to Partial Rendering, be cautious when doing checks in LAYOUTS as these don't re-render on
 *    navigation, meaning the user session won't be checked on every route change."
 *
 * So the model is two-tier, and the split is deliberate:
 *
 *   • `proxy.ts`  — OPTIMISTIC. A cookie-presence check, to redirect early and keep the customer's
 *                   destination. No network. No database. It is a UX affordance, not a gate.
 *   • THIS FILE   — AUTHORITATIVE. Verifies the session AND consults the platform's own customer
 *                   record, because a valid token is not permission: a BARRED customer holds a
 *                   perfectly valid token and must still be refused (FR-025).
 *
 * Every protected page, Server Action, and Route Handler calls `requireCustomer()`. Server Actions
 * are treated as public endpoints, because that is exactly what they are — a POST anyone can craft.
 */

export interface Session {
  sub: string
  /** Authorizes at the gateway (the JWT authorizer's `audience` is the app client id). */
  idToken: string
  /**
   * Authorizes at COGNITO (012). The password + sign-out endpoints relay this to
   * ChangePassword / GlobalSignOut / the attribute-verification pair, all of which are
   * token-authorized rather than IAM-authorized — which is why this slice needs almost no IAM.
   *
   * ⚠ The backend refuses any request whose access-token `sub` differs from the gateway-verified
   * one. See `apis/edge-api/customer/src/password/identity.ts` for the attack that closes.
   */
  accessToken: string | null
}

/**
 * The verified session, or null.
 *
 * `cache()` de-duplicates this within a single request, so a page that checks auth and then fetches
 * data does not decode the token twice.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const session = await runWithAmplifyServerContext({
    nextServerContext: { cookies },
    operation: async (ctx) => {
      try {
        return await fetchAuthSession(ctx)
      } catch {
        return null
      }
    },
  })

  const idToken = session?.tokens?.idToken
  if (!idToken) return null

  const sub = idToken.payload.sub
  if (typeof sub !== "string") return null

  return {
    sub,
    idToken: idToken.toString(),
    accessToken: session?.tokens?.accessToken?.toString() ?? null,
  }
})

/**
 * The customer, as the PLATFORM sees them — or a redirect to sign-in.
 *
 * ⚠ This does NOT trust the token beyond identity. It calls the backend, which upserts the record
 * and enforces `status`. A barred customer gets a 403 here and is signed out of the experience,
 * holding a credential that is, technically, impeccable.
 *
 * `next` carries their destination so authenticating does not cost them their place (FR-020).
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
      // A 403 (barred) or an unreachable backend both land here. We do NOT distinguish them to the
      // customer: telling someone "your account is barred" is an information leak they cannot act
      // on, and telling them "we're broken" when they are barred would be a lie.
      redirect("/account/unavailable")
    }
  },
)
