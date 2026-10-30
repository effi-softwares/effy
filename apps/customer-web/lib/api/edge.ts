import "server-only"

import { ServerApiClient } from "@effy/api-client"

import { edgeApiBaseUrl } from "@/lib/config"

/**
 * The backend gateway; the path's first segment names the service: `/storefront/v1` (public catalogue,
 * no credential: `edgeApiPublic`), `/commerce/v1` (cart, checkout, payment, own orders), `/customer/v1`
 * (profile and account). Which service a new route belongs to: docs/api/path-assignment.md. Everything
 * through `edgeApi(session)` is per-customer and never cached.
 */
/**
 * Takes the whole session because the account routes need two tokens: the gateway authorizes the ID
 * token, Cognito's password APIs the access token (relayed). The backend refuses a mismatched pair, and
 * one session object cannot supply one.
 */
export function edgeApi(session: { idToken: string; accessToken?: string | null }) {
  return new ServerApiClient({
    baseUrl: edgeApiBaseUrl(),
    token: session.idToken,
    accessToken: session.accessToken ?? null,
  })
}

/**
 * An anonymous edge client for the one route with no session: `POST /customer/v1/password/reset-confirm`
 * (the shopper proves the inbox; Cognito checks the code). Called only from a Server Action, so breach
 * screening and the `has_password` record cannot be bypassed (app/(auth)/_lib/recovery-actions.ts).
 */
export function edgeApiPublic() {
  return new ServerApiClient({ baseUrl: edgeApiBaseUrl(), token: null })
}

/** Account data is per-customer: it must never be cached, and never prerendered. */
export const perCustomer: RequestInit = { cache: "no-store" }

/**
 * Next cache options for a public read that is not a storefront page's - today only the order rules
 * (`app/api/cart/policy`).
 *
 * A storefront read that may be shared between requests is a `"use cache"` function instead, taking a
 * lifetime from `lib/cache-life.ts` (`getCategories`, `getHome`, the product page's content). Either
 * way the file must be on the allow-list in `lib/storefront-freshness.guard.test.ts`. Anything
 * fetched with a shopper's session is per-customer and takes `perCustomer` above - a tagged cache
 * entry for one shopper's cart would be served to the next.
 */
export function cached(opts: { tags: string[]; revalidate?: number }): RequestInit {
  return {
    next: { tags: opts.tags, revalidate: opts.revalidate },
  } as RequestInit
}

/** A public read that must nonetheless be fresh on every request. */
export function uncached(): RequestInit {
  return { cache: "no-store" }
}
