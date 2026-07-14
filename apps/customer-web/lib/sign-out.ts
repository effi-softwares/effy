import "server-only"

import { cookies } from "next/headers"

import { edgeApi, perCustomer } from "@/lib/api/edge"
import { getSession } from "@/lib/dal"

/**
 * Ending a session (012 FR-029 / FR-032).
 *
 * ⚠⚠ SIGN-OUT IS SERVER-SIDE, AND IT HAS TO BE. ⚠⚠
 *
 * `aws-amplify/auth/server` has NO `signOut`. Its server entry point exports exactly three things —
 * `fetchAuthSession`, `fetchUserAttributes`, `getCurrentUser` — verified against the installed
 * package, not assumed. The only Amplify sign-out is the CLIENT one, and importing that would drag
 * the auth SDK into the chunk the storefront loads on EVERY page: it would blow the 160 KB guest
 * budget and trip the dependency-cruiser quarantine.
 *
 * So we do it by hand, and it is both simpler and better:
 *
 *   1. Revoke at Cognito (through our own backend, relaying the customer's token).
 *   2. Delete the Amplify cookies from the jar.
 *
 * Guests keep downloading ZERO bytes of auth SDK (research R3).
 *
 * ⚠ This module lives in `lib/`, NOT in the header's import graph. The header reaches sign-out
 * through a plain <form action="/sign-out"> — a URL, not an import — precisely so that
 * `components/header/` never acquires a path to `aws-amplify`. See app/(auth)/sign-out/route.ts.
 */
export async function endSession({ allDevices }: { allDevices: boolean }): Promise<void> {
  const session = await getSession()

  if (session && allDevices) {
    try {
      await edgeApi(session).delete("/customer/v1/sessions", perCustomer)
    } catch {
      // Best-effort — and we STILL clear the cookies below. Refusing to sign the customer out
      // locally because a remote call failed would be perverse: it would leave them signed in on the
      // device in front of them, which is the very one they asked to leave.
    }
  }

  await clearSessionCookies()
}

/**
 * Delete every Amplify session cookie.
 *
 * Amplify (`ssr: true`) stores tokens as `CognitoIdentityServiceProvider.<clientId>.<user>.<kind>`.
 * `lib/session.ts` already READS them by that pattern; this is the same contract, in reverse.
 *
 * ⚠ Enumerating the jar by PREFIX rather than naming the keys is deliberate: a cookie Amplify adds
 * tomorrow (a device key, a new token kind) gets cleared too, instead of being left behind to
 * resurrect a session we believed we had killed.
 */
export async function clearSessionCookies(): Promise<void> {
  const jar = await cookies()
  for (const cookie of jar.getAll()) {
    if (cookie.name.startsWith("CognitoIdentityServiceProvider.")) {
      jar.delete(cookie.name)
    }
  }
}
