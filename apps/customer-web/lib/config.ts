/**
 * Surface configuration.
 *
 * FR-029: every backend address is CONFIGURATION, never a literal. The hot path (`core-api`)
 * runs in local Docker today and will move to deployed compute in its own later slice; when it
 * does, that slice must be able to repoint this surface with an env change and **no code edit**.
 * If you find yourself typing an http:// literal into a component, this is the file you wanted.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. See apps/customer-web/.env.example`,
    )
  }
  return value
}

/** Public origin of this storefront. Anchors every canonical URL, OG tag and the sitemap. */
export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000"
  )
}

/**
 * The HOT path (`core-api`, Go). The routing law (FR-028): product, catalog, search, cart,
 * order and payment are served from here — latency-sensitive customer traffic.
 *
 * LOCAL-ONLY this slice: core-api has no cloud deployment (operator decision 2026-07-14).
 */
export function coreApiBaseUrl(): string {
  return required(
    "NEXT_PUBLIC_CORE_API_BASE_URL",
    process.env.NEXT_PUBLIC_CORE_API_BASE_URL,
  ).replace(/\/$/, "")
}

/**
 * The COLD path (`edge-api`, serverless). Customer profile / account management only.
 *
 * ⚠ IT CARRIES THE `NEXT_PUBLIC_` PREFIX, AND IT DID NOT USED TO. It was `EDGE_API_BASE_URL`,
 * server-only by design — and that is precisely why every signed-in customer on dev landed on
 * /account/unavailable. An Amplify Hosting environment variable is a BUILD variable; AWS states
 * plainly that "a Next.js server component doesn't have access to those environment variables by
 * default." `NEXT_PUBLIC_` is what carries a value past the build, because Next INLINES those into
 * the output. Unprefixed, this threw "Missing required environment variable" at request time on
 * the deployed runtime — and since the throw happened BEFORE the fetch, there was no failed
 * request in the browser, no console error, and nothing in any log to find.
 *
 * The trade is that the edge API's hostname now ships in the client bundle. It is an address, not
 * a credential: every route behind it is authorized by the customer pool's JWT authorizer at the
 * gateway, and an unauthenticated caller gets a flat 401.
 *
 * ⚠ THAT IS NOT PERMISSION TO CALL IT FROM THE BROWSER. The account routes relay the customer's ID
 * *and* access tokens (see lib/api/edge.ts), which must never leave the server, so every caller in
 * this app stays server-side. What changed is the prefix — not the boundary. The boundary now
 * rests on review rather than on the address being unguessable, so keep it where it belongs.
 *
 * No commerce feature may be placed here (FR-028).
 */
export function edgeApiBaseUrl(): string {
  return required(
    "NEXT_PUBLIC_EDGE_API_BASE_URL",
    process.env.NEXT_PUBLIC_EDGE_API_BASE_URL,
  ).replace(/\/$/, "")
}

/** Cognito (customer pool). Values come from the SSM contract `/effy/<env>/auth/customer/*`. */
export function cognitoConfig() {
  return {
    userPoolId: required(
      "NEXT_PUBLIC_COGNITO_USER_POOL_ID",
      process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID,
    ),
    userPoolClientId: required(
      "NEXT_PUBLIC_COGNITO_CLIENT_ID",
      process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID,
    ),
    // The Cognito hosted domain. Required ONLY for Google federation — there is no pure-SDK
    // federation path (research D15). Absent until the Google IdP is applied.
    domain: process.env.NEXT_PUBLIC_COGNITO_DOMAIN ?? "",
  }
}

/** PostHog. Analytics is consent-gated (Principle VII) — see lib/telemetry.ts. */
export function posthogConfig() {
  return {
    key: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "",
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    // 050 FR-028 — first-party ingest path (next.config.ts rewrites it to the PostHog host), so
    // tracking blockers can't drop it and no third-party host appears in the network tab. The real
    // host stays as `ui_host` for the SDK's toolbar links.
    ingestPath: "/rc",
  }
}

/**
 * 050 FR-026 — platform-wide analytics kill switch. Anything but the string "false" (incl. unset) is
 * enabled. Gates analytics AND error-tracking init before any SDK loads, without an app release.
 */
export function telemetryEnabled(): boolean {
  return process.env.NEXT_PUBLIC_TELEMETRY_ENABLED !== "false"
}

/**
 * Stripe (019 checkout). The PUBLISHABLE key is browser-safe — it is a NAME, not a secret (research
 * R3): it can only confirm an intent core-api already authorized. The SECRET key lives ONLY in
 * core-api and never appears here. Test-mode (`pk_test_…`) in dev.
 */
export function stripeConfig() {
  return {
    publishableKey: required(
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    ),
  }
}
