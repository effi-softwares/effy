import { createConfig } from "@effy/web-kit";

// Per-environment config from Vite `VITE_*` (config.contract.md). Every value is NON-SECRET.
// A missing REQUIRED value fails fast, naming the key (FR-014) — never a silent mis-target.
// The loader is shared; only the key list and the pool it points at are this surface's.
const REQUIRED = [
  "VITE_COGNITO_USER_POOL_ID",
  "VITE_COGNITO_CLIENT_ID",
  "VITE_API_BASE_URL",
  // ⚠ 055: a SECOND backend. Refunds are issued by core-api because the payment secret lives there
  // and nowhere else (019 SC-012). REQUIRED rather than optional: a console that boots without it
  // would render a refund control that fails at the first click, and the failure would look like a
  // permissions problem rather than a missing config value.
  "VITE_CORE_API_BASE_URL",
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
  /**
   * ⚠ 055: a SECOND backend, and the console genuinely talks to two hosts.
   *
   * Refunds are issued by `core-api` because the payment secret lives there and nowhere else
   * (019 SC-012). Everything else this console reads comes from the shared gateway. The alternative —
   * routing refunds through the cold path — would have meant either duplicating the platform's most
   * dangerous secret into a Lambda, or forwarding an operator's token between services, which is the
   * auth-brokering Principle IV forbids by name (055 research R1).
   */
  coreApiBaseUrl: (): string => cfg.require("VITE_CORE_API_BASE_URL"),
  posthogKey: (): string | undefined => cfg.optional("VITE_POSTHOG_KEY"),
  posthogHost: (): string | undefined => cfg.optional("VITE_POSTHOG_HOST"),
  // 050 FR-026 — analytics kill switch. Anything but the string "false" (incl. unset) = enabled.
  telemetryEnabled: (): boolean => cfg.optional("VITE_TELEMETRY_ENABLED") !== "false",
};
