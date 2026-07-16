import { createTelemetry } from "@effy/web-kit";

import { config } from "./env";

// Product analytics + web error tracking (constitution Principle VII). The PostHog wiring is
// shared; this taxonomy is the shop audience's own.
//
// Every event carries `surface: "shop-web"` (stamped by createTelemetry) so shop-audience events
// are distinguishable from back-office events (FR-016). NO PII beyond the verified subject id —
// never the email, the OTP code, a token, or a shop code.
export type ShopAnalyticsEvent =
  | { name: "shop_auth_sign_in_started" }
  | { name: "shop_auth_otp_submitted" }
  | { name: "shop_auth_sign_in_succeeded"; subject: string }
  | { name: "shop_auth_sign_in_failed"; reason: string }
  | { name: "shop_auth_signed_out" }
  | { name: "shop_manager_area_access_denied" }
  | { name: "shop_assignment_missing" }
  // Catalog (016) — no PII beyond the subject id; never a product name, SKU, or the search text.
  | { name: "product_create_started" }
  | { name: "product_created"; productId: string }
  | { name: "product_edit_saved"; productId: string }
  | { name: "product_archived"; productId: string }
  | { name: "catalog_search" }
  | { name: "catalog_filter_applied" };

const telemetry = createTelemetry<ShopAnalyticsEvent>({
  key: config.posthogKey(),
  host: config.posthogHost(),
  surface: "shop-web",
});

export const initTelemetry = telemetry.init;
export const track = telemetry.track;
export const reportError = telemetry.reportError;
