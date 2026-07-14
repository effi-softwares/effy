import "server-only"

import { cookies } from "next/headers"

/**
 * Reading the session ON THE SERVER, for guest-facing pages.
 *
 * This is the mechanism that lets the storefront show "Hi Janith" in the header while shipping
 * a guest ZERO bytes of the auth SDK (FR-006). The tokens are in cookies (Amplify's `ssr: true`
 * mode puts them there precisely so the server can read them), so the server can tell who the
 * visitor is without any client-side JavaScript being involved at all.
 *
 * ⚠ Anything that calls this becomes REQUEST-TIME. That is fine — and expected — inside a
 * <Suspense> boundary, where it becomes a streamed hole in an otherwise static page. It is a
 * catastrophe anywhere above one: reading cookies in a layout defers the ENTIRE APP to request
 * time and destroys the static shell for every page. See app/layout.tsx.
 *
 * This is a PRESENTATION-level read only: "is someone signed in, and what do we call them?"
 * It is NOT an authorization decision. Authorization happens in lib/dal.ts, against the
 * platform's own customer record — because a token says who you are, and only our record says
 * whether you are allowed (FR-025).
 */

/** Amplify stores tokens under `CognitoIdentityServiceProvider.<clientId>.<user>.idToken`. */
const ID_TOKEN_RE = /^CognitoIdentityServiceProvider\..+\.idToken$/

export interface ServerSession {
  sub: string
  email: string | null
  /**
   * Name parts, from the ID token's standard `given_name` / `family_name` claims. For the header
   * greeting and the avatar's initials — PRESENTATION ONLY.
   *
   * ⚠ These are CLAIMS, not the record. They can lag the record by up to a token lifetime, which is
   * why `updateProfile` forces a token refresh after a name change (012 FR-008, research R11). Do not
   * make any decision from them beyond what to draw.
   */
  givenName: string | null
  familyName: string | null
}

/** The signed-in customer, or null for a guest. Never throws — a guest is not an error. */
export async function readServerSession(): Promise<ServerSession | null> {
  const jar = await cookies()

  const idCookie = jar.getAll().find((c) => ID_TOKEN_RE.test(c.name))
  if (!idCookie?.value) return null

  const claims = decodeJwtPayload(idCookie.value)
  if (!claims?.sub) return null

  return {
    sub: String(claims.sub),
    email: typeof claims.email === "string" ? claims.email : null,
    givenName: typeof claims.given_name === "string" ? claims.given_name : null,
    familyName: typeof claims.family_name === "string" ? claims.family_name : null,
  }
}

/**
 * Decode (NOT verify) a JWT payload.
 *
 * ⚠ There is no signature check here, and that is deliberate — but it means the result is
 * UNTRUSTED. It is safe for exactly one thing: deciding whether to render "Sign in" or a name
 * in the header. A forged cookie buys an attacker the ability to see their own name spelled
 * wrong on their own screen.
 *
 * It MUST NOT be used to authorize anything. Every protected read goes through lib/dal.ts and
 * is validated by the API Gateway's JWT authorizer at the backend, which does verify the
 * signature and pins the issuer to the customer pool.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".")
  if (parts.length !== 3) return null
  try {
    const json = Buffer.from(
      parts[1].replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8")
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}
