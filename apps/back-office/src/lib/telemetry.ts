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
  // Driver-management events (056). ⚠ NO PII: `driverId` is a platform identifier. A driver's name,
  // work email, phone and emergency contact must never appear in an analytics payload (FR-050) — and
  // the emergency contact is a THIRD PARTY who never dealt with Effy at all.
  | { name: "driver_created"; driverId: string }
  | { name: "driver_status_changed"; driverId: string; status: string }
  | { name: "driver_exception_resolved"; kind: string }
  | { name: "driver_work_released"; released: number }
  // 067 — product review. ⚠ NEVER a price, a margin value, a product name or the send-back reason:
  // the first two are a shop's money and Effy's, the last is free text about a shop's product.
  // `kind` and `decision` are closed vocabularies; `marginSet` says only THAT one was confirmed.
  | {
      name: "product_review_decided";
      productId: string;
      kind: "new_product" | "change";
      decision: "approved" | "sent_back";
      marginSet: boolean;
    }
  | { name: "product_margin_set"; productId: string };

const telemetry = createTelemetry<AnalyticsEvent>({
  key: config.posthogKey(),
  host: config.posthogHost(),
  surface: "back-office",
  enabled: config.telemetryEnabled(),
});

export const initTelemetry = telemetry.init;
export const track = telemetry.track;
export const reportError = telemetry.reportError;
