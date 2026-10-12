import "server-only"

import { cache } from "react"
import { cookies } from "next/headers"
import { CognitoJwtVerifier } from "aws-jwt-verify"
import { SimpleJsonFetcher } from "aws-jwt-verify/https"
import { SimpleJwksCache } from "aws-jwt-verify/jwk"

import { refreshTokens, type FreshTokens } from "@/lib/cognito"
import { cognitoConfig } from "@/lib/config"
import { SESSION_COOKIES, sessionCookieOptions } from "@/lib/session-cookies"

/**
 * THE customer session, on the server. One read, used by everything.
 *
 * How a session exists at all:
 *   1. the browser signs in with Cognito directly (`app/(auth)`);
 *   2. it hands the tokens to `POST /api/session` once, which verifies them and stores them in
 *      `HttpOnly` cookies — from then on no page script can read them;
 *   3. `proxy.ts` swaps expired tokens for fresh ones before a request is rendered;
 *   4. `getSession()` below verifies the id token and says who the customer is.
 *
 * ⚠ Anything that calls `getSession` becomes REQUEST-TIME. Fine inside a <Suspense> boundary;
 * never above one (see app/layout.tsx).
 *
 * ⚠ A token says who you are. Whether you may do something is the backend's decision, made again
 * on every call with this same token — and `requireCustomer` (lib/dal.ts) for pages.
 */
export interface Session {
  sub: string
  idToken: string
  accessToken: string | null
  email: string | null
  givenName: string | null
  familyName: string | null
}

/* ── Verification ────────────────────────────────────────────────────────────────────────────── */

/**
 * ⚠ THE KEY DOWNLOAD GETS TEN SECONDS, NOT THE LIBRARY'S 1.5. A cold connection to the pool's region
 * has been measured at over three seconds from a developer's machine; at 1.5s every signed-in
 * customer was treated as signed out, with nothing logged. Keys are cached for the life of the
 * process, so this is paid once.
 */
const jwksCache = new SimpleJwksCache({
  fetcher: new SimpleJsonFetcher({ defaultRequestOptions: { responseTimeout: 10_000 } }),
})

function verifier(tokenUse: "id" | "access") {
  const { userPoolId, userPoolClientId } = cognitoConfig()
  return CognitoJwtVerifier.create({ userPoolId, clientId: userPoolClientId, tokenUse }, { jwksCache })
}

let idVerifier: ReturnType<typeof verifier> | undefined
let accessVerifier: ReturnType<typeof verifier> | undefined

/**
 * Is this failure "we could not check" rather than "this token is bad"?
 *
 * ⚠ THE DISTINCTION IS THE POINT. A bad token means nobody is signed in. Not being able to fetch
 * the pool's keys means we do not know — and that must surface as an error, never as a quiet
 * sign-out.
 */
function couldNotCheck(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name ?? ""
  return name === "FetchError" || name === "NonRetryableFetchError" || name === "WaitPeriodNotYetEndedJwkError"
}

type Claims = Record<string, unknown> & { sub: string }

/** The token's claims, or `null` if it is not a valid, unexpired token of ours. Throws if unknowable. */
async function verify(token: string, use: "id" | "access"): Promise<Claims | null> {
  try {
    if (use === "id") return (await (idVerifier ??= verifier("id")).verify(token)) as Claims
    return (await (accessVerifier ??= verifier("access")).verify(token)) as Claims
  } catch (err) {
    if (couldNotCheck(err)) throw new Error("The sign-in keys could not be fetched", { cause: err })
    return null
  }
}

/* ── Reading ─────────────────────────────────────────────────────────────────────────────────── */

const text = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null)

/** Who is signed in, or `null`. Memoised per request. */
export const getSession = cache(async (): Promise<Session | null> => {
  const jar = await cookies()
  const idToken = jar.get(SESSION_COOKIES.id)?.value
  if (!idToken) return null

  const claims = await verify(idToken, "id")
  if (!claims) return null

  return {
    sub: claims.sub,
    idToken,
    accessToken: jar.get(SESSION_COOKIES.access)?.value ?? null,
    email: text(claims.email),
    givenName: text(claims.given_name),
    familyName: text(claims.family_name),
  }
})

/* ── Writing (Route Handlers and Server Actions only — a Server Component cannot set cookies) ──── */

/**
 * Start a session from tokens the browser was just issued.
 *
 * Returns `false` when the tokens are not ours, not current, or do not belong to one person.
 */
export async function startSession(tokens: {
  idToken: string
  accessToken: string
  refreshToken: string
}): Promise<boolean> {
  const [id, access] = await Promise.all([
    verify(tokens.idToken, "id"),
    verify(tokens.accessToken, "access"),
  ])
  if (!id || !access || id.sub !== access.sub) return false

  const jar = await cookies()
  const options = sessionCookieOptions()
  jar.set(SESSION_COOKIES.id, tokens.idToken, options)
  jar.set(SESSION_COOKIES.access, tokens.accessToken, options)
  jar.set(SESSION_COOKIES.refresh, tokens.refreshToken, options)
  return true
}

/**
 * Fetch new tokens NOW, ahead of their expiry — after a profile change, so the header's greeting
 * (a claim in the id token) is right on the very next render.
 */
export async function renewSession(): Promise<void> {
  const jar = await cookies()
  const refreshToken = jar.get(SESSION_COOKIES.refresh)?.value
  if (!refreshToken) return
  let fresh: FreshTokens | null
  try {
    fresh = await refreshTokens(refreshToken)
  } catch {
    return // the current tokens stay; the claim catches up at the next hourly refresh
  }
  if (!fresh) return
  const options = sessionCookieOptions()
  jar.set(SESSION_COOKIES.id, fresh.idToken, options)
  jar.set(SESSION_COOKIES.access, fresh.accessToken, options)
}

export async function clearSessionCookies(): Promise<void> {
  const jar = await cookies()
  for (const name of Object.values(SESSION_COOKIES)) jar.delete(name)
}
