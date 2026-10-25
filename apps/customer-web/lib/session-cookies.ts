import { siteUrl } from "@/lib/config"

/**
 * The three cookies that are a customer's session, and nothing else about it.
 *
 * Written only by the server (`startSessionAction`, `proxy.ts`), always `HttpOnly`: page JavaScript can
 * never read a token. Shared by the request proxy and the server modules, so it imports nothing that
 * only one of them can load.
 */
export const SESSION_COOKIES = {
  id: "effy_id",
  access: "effy_at",
  refresh: "effy_rt",
} as const

/**
 * How long the browser keeps them: the refresh token's own lifetime (Terraform:
 * `refresh_token_validity_days`). The id and access tokens expire after an hour on their own terms;
 * their cookies outlive them so the proxy can see "expired, refresh me" rather than "signed out".
 */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    // `Secure` wherever the site is served over TLS. Plain-http local development still works.
    secure: siteUrl().startsWith("https://"),
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  }
}

/** A token's expiry in epoch seconds, read without verifying it: used only to decide whether to refresh (`getSession` verifies). */
export function jwtExpiry(token: string | undefined): number | null {
  const payload = token?.split(".")[1]
  if (!payload) return null
  try {
    const exp = (JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: unknown })
      .exp
    return typeof exp === "number" ? exp : null
  } catch {
    return null
  }
}
