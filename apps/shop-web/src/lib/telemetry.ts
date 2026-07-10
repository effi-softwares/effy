import { createTelemetry } from "@effy/web-kit";

import { config } from "./env";

// Product analytics + web error tracking (constitution Principle VII). The PostHog wiring is
// shared; this taxonomy is the store audience's own.
//
// Every event carries `surface: "shop-web"` (stamped by createTelemetry) so store-audience events
// are distinguishable from back-office events (FR-016). NO PII beyond the verified subject id —
// never the email, the OTP code, a token, or a store code.
export type ShopAnalyticsEvent =
  | { name: "shop_auth_sign_in_started" }
  | { name: "shop_auth_otp_submitted" }
  | { name: "shop_auth_sign_in_succeeded"; subject: string }
  | { name: "shop_auth_sign_in_failed"; reason: string }
  | { name: "shop_auth_signed_out" }
  | { name: "shop_manager_area_access_denied" }
  | { name: "shop_store_assignment_missing" };

const telemetry = createTelemetry<ShopAnalyticsEvent>({
  key: config.posthogKey(),
  host: config.posthogHost(),
  surface: "shop-web",
});

export const initTelemetry = telemetry.init;
export const track = telemetry.track;
export const reportError = telemetry.reportError;
