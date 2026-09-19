import { createConfig } from "@effy/web-kit";

// Per-environment config from Vite `VITE_*` (contracts/config.contract.md). Every value is
// NON-SECRET. A missing REQUIRED value fails fast, naming the key (FR-017) — never a silent
// mis-target of the wrong environment, or worse, the wrong identity pool.
const REQUIRED = [
  "VITE_COGNITO_USER_POOL_ID",
  "VITE_COGNITO_CLIENT_ID",
  "VITE_API_BASE_URL",
  // ⚠ 057 — a SECOND backend host, and the reason is Principle III, not convenience. Everything the
  // shop console does is cold-path CRUD on the shared gateway EXCEPT issuing a refund, which must
  // settle through 055's state machine — and that lives in core-api because the payment secret does
  // (019 SC-012). This is the same split 011's FR-028 set for the customer surfaces.
  "VITE_CORE_API_BASE_URL",
  // ⚠ 059 — WEB PUSH. All five are PUBLIC BY DESIGN: they identify the Firebase project, they do not
  // authorise anything. The secret half is the service account, which lives in Secrets Manager and
  // is read only by the notifications worker — it never reaches a browser.
  //
  // ⚠ REQUIRED, NOT OPTIONAL, deliberately. Constitution § Real-World Identifiers: "where an
  // identifier is not yet known, the configuration MUST fail loudly." A console that boots without
  // a VAPID key does not fail — `getToken` simply never resolves, permission is granted, and the
  // operator is left with a toggle that is on and a device that never rings. That is precisely the
  // silently-wrong outward-facing value the rule exists to prevent.
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_VAPID_PUBLIC_KEY",
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
  /** The shared gateway host; paths carry /shop/v1/... */
  apiBaseUrl: (): string => cfg.require("VITE_API_BASE_URL"),
  /**
   * The HOT path (core-api). ⚠ Used by exactly one call — the shop refund — and it should stay that
   * way: every other shop capability belongs on the cold path. A second base URL is an invitation to
   * drift, so the one legitimate user of it is named here.
   */
  coreApiBaseUrl: (): string => cfg.require("VITE_CORE_API_BASE_URL"),
  posthogKey: (): string | undefined => cfg.optional("VITE_POSTHOG_KEY"),
  posthogHost: (): string | undefined => cfg.optional("VITE_POSTHOG_HOST"),
  // 050 FR-026 — analytics kill switch. Anything but the string "false" (incl. unset) = enabled.
  telemetryEnabled: (): boolean => cfg.optional("VITE_TELEMETRY_ENABLED") !== "false",

  /**
   * 059 — the Firebase web app identity, for FCM web push.
   *
   * ⚠ Read LAZILY, from the notification feature only. `firebase/app` and `firebase/messaging` are
   * dynamically imported (research R14) so they never land on the sign-in path, and calling this at
   * module scope would defeat that by pulling config resolution forward.
   */
  firebase: (): {
    apiKey: string;
    projectId: string;
    appId: string;
    messagingSenderId: string;
  } => ({
    apiKey: cfg.require("VITE_FIREBASE_API_KEY"),
    projectId: cfg.require("VITE_FIREBASE_PROJECT_ID"),
    appId: cfg.require("VITE_FIREBASE_APP_ID"),
    messagingSenderId: cfg.require("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  }),

  /** The Web Push certificate's public key (Firebase console → Cloud Messaging → Web config). */
  vapidPublicKey: (): string => cfg.require("VITE_VAPID_PUBLIC_KEY"),
};
