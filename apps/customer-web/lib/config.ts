/**
 * Surface configuration.
 *
 * Every backend address is configuration, never a literal - an environment is repointed
 * with an env change and **no code edit**. If you find yourself typing an http:// literal into a
 * component, this is the file you wanted.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. See apps/customer-web/.env.example`,
    )
  }
  return value
}

/** Public origin of this storefront. Anchors every canonical URL, og tag and the sitemap. */
export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000"
  )
}

/**
 * The backend gateway (see lib/api/edge.ts). `NEXT_PUBLIC_` because an Amplify Hosting variable is a
 * build variable: unprefixed, a server component cannot read it at request time, and the throw happened
 * before any fetch, so it left no trace.
 *
 * The hostname ships in the client bundle. It is an address, not a credential (every route is authorized
 * at the gateway), and still not for the browser to call: the account routes relay ID and access tokens
 * that never leave the server.
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
    // The Cognito hosted domain. Required only for Google federation - there is no pure-SDK
    // federation path. Absent until the Google IdP is applied.
    domain: process.env.NEXT_PUBLIC_COGNITO_DOMAIN ?? "",
  }
}

/** PostHog. Analytics is consent-gated (Principle VII) - see lib/telemetry.ts. */
export function posthogConfig() {
  return {
    key: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "",
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    // First-party ingest path (next.config.ts rewrites it to the PostHog host), so
    // tracking blockers can't drop it and no third-party host appears in the network tab. The real
    // host stays as `ui_host` for the sdk's toolbar links.
    ingestPath: "/rc",
  }
}

/**
 * Platform-wide analytics kill switch. Anything but the string "false" (incl. unset) is
 * enabled. Gates analytics and error-tracking init before any SDK loads, without an app release.
 */
export function telemetryEnabled(): boolean {
  return process.env.NEXT_PUBLIC_TELEMETRY_ENABLED !== "false"
}

/**
 * Stripe (019 checkout). The publishable key is browser-safe - it is a name, not a secret (research
 * R3): it can only confirm an intent the backend already authorized. The secret key lives only in
 * the backend's secret store and never appears here. Test-mode (`pk_test_…`) in dev.
 */
export function stripeConfig() {
  return {
    publishableKey: required(
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    ),
  }
}
