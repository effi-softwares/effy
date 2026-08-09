import { createConfig } from "@effy/web-kit";

// Per-environment config from Vite `VITE_*` (config.contract.md). Every value is NON-SECRET.
// A missing REQUIRED value fails fast, naming the key (FR-014) — never a silent mis-target.
// The loader is shared; only the key list and the pool it points at are this surface's.
const REQUIRED = [
  "VITE_COGNITO_USER_POOL_ID",
  "VITE_COGNITO_CLIENT_ID",
  "VITE_API_BASE_URL",
] as const;

const cfg = createConfig(
  REQUIRED,
  import.meta.env as unknown as Record<string, string | undefined>,
  "Set them in apps/back-office/.env.local (see contracts/config.contract.md).",
);

export function assertConfig(): void {
  cfg.assert();
}

export const config = {
  cognitoUserPoolId: (): string => cfg.require("VITE_COGNITO_USER_POOL_ID"),
  cognitoClientId: (): string => cfg.require("VITE_COGNITO_CLIENT_ID"),
  apiBaseUrl: (): string => cfg.require("VITE_API_BASE_URL"),
  posthogKey: (): string | undefined => cfg.optional("VITE_POSTHOG_KEY"),
  posthogHost: (): string | undefined => cfg.optional("VITE_POSTHOG_HOST"),
  /**
   * The customer storefront's public origin — where a home-page preview opens (042 US3).
   *
   * ⚠ OPTIONAL, so a console without it simply has no preview control rather than failing to boot.
   * A required value here would make the whole back office unusable on any environment where the
   * storefront is not yet deployed, over a feature that only affects one screen.
   */
  storefrontBaseUrl: (): string | undefined => cfg.optional("VITE_STOREFRONT_BASE_URL"),
};
