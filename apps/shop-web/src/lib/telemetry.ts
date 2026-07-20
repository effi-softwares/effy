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
  | { name: "catalog_filter_applied" }
  // Fulfilment (020) — docs/telemetry/fulfillment-events.md is the cross-surface source of truth,
  // so shop-mobile adopts these exact names when its telemetry lands.
  //
  // A tighter PII rule applies here than elsewhere: these events describe an operator handling a
  // REAL customer's order. `fulfillmentId` is the portion (a unit of work), which is safe. Note what
  // is deliberately ABSENT: `orderNumber` (a customer-facing reference that would tie analytics to
  // an identifiable purchase), any shop id (shops are hidden fulfilment nodes, and including one
  // would turn every dashboard into a per-shop leaderboard by accident), and any product name or
  // shortfall quantity (an unresolved financial obligation belongs in the operational record, not
  // in product analytics).
  | { name: "shop_order_queue_viewed"; state: "active" | "completed" }
  | { name: "shop_order_opened"; fulfillmentId: string; status: string }
  | { name: "shop_order_state_changed"; fulfillmentId: string; from: string; to: string }
  | { name: "shop_order_reversed"; fulfillmentId: string }
  | { name: "shop_order_item_gathered"; fulfillmentId: string }
  | { name: "shop_order_item_unavailable"; fulfillmentId: string }
  | { name: "shop_order_item_restored"; fulfillmentId: string };

const telemetry = createTelemetry<ShopAnalyticsEvent>({
  key: config.posthogKey(),
  host: config.posthogHost(),
  surface: "shop-web",
});

export const initTelemetry = telemetry.init;
export const track = telemetry.track;
export const reportError = telemetry.reportError;
