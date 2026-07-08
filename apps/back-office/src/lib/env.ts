// Per-environment config from Vite `VITE_*` (config.contract.md). Every value is NON-SECRET.
// A missing REQUIRED value fails fast, naming the key (FR-014) — never a silent mis-target.

const REQUIRED = [
  "VITE_COGNITO_USER_POOL_ID",
  "VITE_COGNITO_CLIENT_ID",
  "VITE_API_BASE_URL",
] as const;

export function assertConfig(): void {
  const missing = REQUIRED.filter((k) => !import.meta.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required config: ${missing.join(", ")}. ` +
        `Set them in apps/back-office/.env.local (see contracts/config.contract.md).`,
    );
  }
}

export const config = {
  cognitoUserPoolId: (): string => import.meta.env.VITE_COGNITO_USER_POOL_ID,
  cognitoClientId: (): string => import.meta.env.VITE_COGNITO_CLIENT_ID,
  apiBaseUrl: (): string => import.meta.env.VITE_API_BASE_URL,
  posthogKey: (): string | undefined => import.meta.env.VITE_POSTHOG_KEY,
  posthogHost: (): string | undefined => import.meta.env.VITE_POSTHOG_HOST,
};
