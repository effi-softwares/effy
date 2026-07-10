import { createConfig } from "@effy/web-kit";

// Per-environment config from Vite `VITE_*` (contracts/config.contract.md). Every value is
// NON-SECRET. A missing REQUIRED value fails fast, naming the key (FR-017) — never a silent
// mis-target of the wrong environment, or worse, the wrong identity pool.
const REQUIRED = [
  "VITE_COGNITO_USER_POOL_ID",
  "VITE_COGNITO_CLIENT_ID",
  "VITE_API_BASE_URL",
] as const;

const cfg = createConfig(
  REQUIRED,
  import.meta.env as unknown as Record<string, string | undefined>,
  "Set them in apps/shop-web/.env.local (see specs/007-shop-web/contracts/config.contract.md).",
);

export function assertConfig(): void {
  cfg.assert();
}

export const config = {
  /** The SHOP pool — /effy/<env>/auth/shop/user_pool_id. Not back-office. */
  cognitoUserPoolId: (): string => cfg.require("VITE_COGNITO_USER_POOL_ID"),
  cognitoClientId: (): string => cfg.require("VITE_COGNITO_CLIENT_ID"),
  /** The shared gateway host; paths carry /store/v1/... */
  apiBaseUrl: (): string => cfg.require("VITE_API_BASE_URL"),
  posthogKey: (): string | undefined => cfg.optional("VITE_POSTHOG_KEY"),
  posthogHost: (): string | undefined => cfg.optional("VITE_POSTHOG_HOST"),
};
