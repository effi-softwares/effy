import { createConfig } from "@effy/web-kit"

const REQUIRED = [
  "VITE_COGNITO_USER_POOL_ID",
  "VITE_COGNITO_CLIENT_ID",
  "VITE_API_BASE_URL",
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_VAPID_PUBLIC_KEY",
] as const

const cfg = createConfig(
  REQUIRED,
  import.meta.env as unknown as Record<string, string | undefined>,
  "Set them in apps/shop-web/.env.local (see specs/007-shop-web/contracts/config.contract.md).",
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

  firebase: (): {
    apiKey: string
    projectId: string
    appId: string
    messagingSenderId: string
  } => ({
    apiKey: cfg.require("VITE_FIREBASE_API_KEY"),
    projectId: cfg.require("VITE_FIREBASE_PROJECT_ID"),
    appId: cfg.require("VITE_FIREBASE_APP_ID"),
    messagingSenderId: cfg.require("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  }),

  vapidPublicKey: (): string => cfg.require("VITE_VAPID_PUBLIC_KEY"),
}
