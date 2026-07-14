import { cognitoConfig } from "@/lib/config"

/**
 * Which credential routes are actually available (FR-010).
 *
 * ⚠ Google is BUILT but PARKED (operator decision, 2026-07-14). Rather than deleting the code — and
 * having to rebuild and re-review it later — federation is gated on whether a Cognito hosted domain
 * is configured. That is not an arbitrary flag: the domain IS the federation mechanism. There is no
 * pure-SDK federation path, so without a domain `signInWithRedirect` has nowhere to send the
 * customer, and offering the button would be offering a door with no room behind it.
 *
 * So the rule is simply: NO DOMAIN → NO GOOGLE BUTTON. When Terraform is applied with
 * `customer_google_enabled = true`, the domain lands in SSM, the env var is populated, and the
 * button appears. No code change.
 */
export function googleEnabled(): boolean {
  return cognitoConfig().domain !== ""
}
