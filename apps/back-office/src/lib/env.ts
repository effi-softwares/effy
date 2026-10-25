import { createConfig } from "@effy/web-kit"

const REQUIRED = ["VITE_COGNITO_USER_POOL_ID", "VITE_COGNITO_CLIENT_ID", "VITE_API_BASE_URL"] as const

const cfg = createConfig(
  REQUIRED,
  import.meta.env as unknown as Record<string, string | undefined>,
  "Set them in apps/back-office/.env.local (see contracts/config.contract.md).",
)

export function assertConfig(): void {
  cfg.assert()
}

export const config = {
  cognitoUserPoolId: (): string => cfg.require("VITE_COGNITO_USER_POOL_ID"),
  cognitoClientId: (): string => cfg.require("VITE_COGNITO_CLIENT_ID"),
  apiBaseUrl: (): string => cfg.require("VITE_API_BASE_URL"),
  posthogKey: (): string | undefined => cfg.optional("VITE_POSTHOG_KEY"),
  posthogHost: (): string | undefined => cfg.optional("VITE_POSTHOG_HOST"),
  telemetryEnabled: (): boolean => cfg.optional("VITE_TELEMETRY_ENABLED") !== "false",
}
