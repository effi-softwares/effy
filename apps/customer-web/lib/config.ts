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
 * Server-side only — it is never read in the browser, so it carries no NEXT_PUBLIC_ prefix.
 * No commerce feature may be placed here (FR-028).
 */
export function edgeApiBaseUrl(): string {
  return required("EDGE_API_BASE_URL", process.env.EDGE_API_BASE_URL).replace(
    /\/$/,
    "",
  )
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
  }
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
