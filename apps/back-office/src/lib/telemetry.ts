import { createTelemetry } from "@effy/web-kit";

import { config } from "./env";

// Product analytics + web error tracking (Principle VII). The PostHog wiring is shared; the event
// TAXONOMY is this surface's own — a typed union, so a future screen extends it rather than
// inventing free-form strings. No PII beyond the verified subject id.
export type AnalyticsEvent =
  | { name: "auth_sign_in_started" }
  | { name: "auth_otp_submitted" }
  | { name: "auth_sign_in_succeeded"; subject: string }
  | { name: "auth_sign_in_failed"; reason: string }
  | { name: "auth_signed_out" }
  | { name: "admin_area_access_denied" }
  // Shop-management events (009). No PII beyond the auto-stamped subject id; `shopId` is a
  // platform identifier, never an operator-typed value.
  | { name: "shop_created"; shopId: string }
  | { name: "shop_updated"; shopId: string }
  | { name: "shop_status_changed"; shopId: string }
  | { name: "shop_deleted"; shopId: string }
  | { name: "shop_user_provisioned"; shopId: string }
  | { name: "shop_user_role_changed"; shopId: string }
  | { name: "shop_user_status_changed"; shopId: string }
  // Catalog schema-authority events (016). No PII — the ids are platform identifiers, never
  // operator-typed values.
  | { name: "schema_type_created"; productTypeId: string }
  | { name: "schema_attribute_created"; attributeId: string }
  // Home Composer events (042). ⚠ `blocks` is a COUNT, never the layout body — the body is operator
  // copy destined for a public page, and shipping it to a third-party analytics vendor is not
  // something a telemetry call should quietly decide. No PII beyond the auto-stamped subject id.
  | { name: "home_layout_edited"; blocks: number }
  | { name: "home_layout_published"; blocks: number }
  | { name: "home_layout_reverted" }
  | { name: "home_layout_previewed" };

const telemetry = createTelemetry<AnalyticsEvent>({
  key: config.posthogKey(),
  host: config.posthogHost(),
  surface: "back-office",
});

export const initTelemetry = telemetry.init;
export const track = telemetry.track;
export const reportError = telemetry.reportError;
