import { cognitoConfig } from "@/lib/config"

/**
 * Which credential routes are available. Google federation needs a Cognito hosted domain (there is no
 * pure-SDK federation path), so the button shows only when one is configured: applying Terraform with
 * `customer_google_enabled = true` publishes it and the button appears, with no code change.
 */
export function googleEnabled(): boolean {
  return cognitoConfig().domain !== ""
}
