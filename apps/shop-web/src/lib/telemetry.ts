import { createTelemetry } from "@effy/web-kit";

import { config } from "./env";

// Product analytics + web error tracking (constitution Principle VII). The PostHog wiring is
// shared; this taxonomy is the shop audience's own.
//
// Every event carries `surface: "shop-web"` (stamped by createTelemetry) so shop-audience events
// are distinguishable from back-office events. No PII beyond the verified subject id
// never the email, the OTP code, a token, or a shop code.
export type ShopAnalyticsEvent =
  | { name: "shop_auth_sign_in_started" }
  | { name: "shop_auth_otp_submitted" }
  | { name: "shop_auth_sign_in_succeeded"; subject: string }
  | { name: "shop_auth_sign_in_failed"; reason: string }
  | { name: "shop_auth_signed_out" }
  | { name: "shop_assignment_missing" }
  // Catalog — no PII beyond the subject id; never a product name, SKU, or the search text.
  | { name: "product_create_started" }
  | { name: "product_created"; productId: string }
  | { name: "product_edit_saved"; productId: string }
  // A product's sizes saved (a count, never a price), and a size put on or off sale.
  | { name: "product_variants_saved"; productId: string; variantCount: number }
  /** The stock table saved several sizes at once (mode = add received / set count). */
  | { name: "stock_table_saved"; productId: string; mode: "receive" | "count"; sizes: number }
  | { name: "product_variant_state_changed"; productId: string; state: "active" | "inactive" | "removed" }
  | { name: "product_archived"; productId: string }
  // Review. Never the send-back reason, a price or a margin: the first is free text written
  // about a shop's product, the others are the shop's money.
  | { name: "product_submitted_for_review"; productId: string }
  | { name: "product_review_withdrawn"; productId: string }
  | { name: "catalog_search" }
  | { name: "catalog_filter_applied" }
  // Fulfilment — docs/telemetry/fulfillment-events.md is the cross-surface source of truth,
  // so shop-mobile adopts these exact names when its telemetry lands.
  //
  // A tighter PII rule applies here than elsewhere: these events describe an operator handling a
  // real customer's order. `fulfillmentId` is the portion (a unit of work), which is safe. Note what
  // is deliberately absent: `orderNumber` (a customer-facing reference that would tie analytics to
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
  | { name: "shop_order_item_restored"; fulfillmentId: string }
  // A shop manager refunded their own portion. NO amount, NO order number, NO line names:
  // the same PII rule the fulfilment events hold to. `fulfillmentId` is a unit of work, not a person.
  | { name: "shop_refund_initiated"; fulfillmentId: string }
  // Package labels printed. No package code or order number: a unit of work, a layout, a count.
  | { name: "shop_labels_printed"; fulfillmentId: string; layout: string; count: number }
  // Bags. Counts and ids only; never a code, name or address.
  | { name: "parcels_declared"; fulfillmentId: string; count: number }
  | { name: "labels_printed"; orders: number; count: number; layout: string; path: string }
  | { name: "pack_scanned"; fulfillmentId: string }
  // Team management. Never the invitee's email or name: this is the one event that would
  // otherwise carry a colleague's identity into product analytics.
  | { name: "shop_staff_invited"; role: string }
  | { name: "shop_staff_deactivated" }
  // Today and Insights. NO figures, NO order numbers, NO product names: an analytics event
  // that carried a shop's revenue would put the shop's money in a third-party product tool, which is
  // a different question from whether anyone uses the screen. `kind`, `action`, `range` and `metric`
  // are all closed vocabularies, so these stay low-cardinality too (Principle VII).
  | { name: "today_viewed" }
  | { name: "today_attention_acted"; kind: string }
  | { name: "quick_action_used"; action: string }
  | { name: "insights_viewed"; range: string }
  | { name: "insights_range_changed"; range: string }
  | { name: "insights_drilled"; metric: string }
  | { name: "insights_exported"; range: string }
  // 059 PWA + notifications
  // No PII, as everywhere else: a method, a permission outcome, a notification type. Never a
  // token, never an address, never which product ran out.
  | { name: "pwa_install_prompted"; method: string }
  | { name: "pwa_installed" }
  | { name: "sw_update_applied" }
  | { name: "notif_permission_requested" }
  | { name: "notif_permission_result"; result: string }
  | { name: "notif_enabled" }
  | { name: "notif_disabled" }
  | { name: "notif_type_muted"; type: string }
  | { name: "notif_type_unmuted"; type: string }
  /**
   * The number that decides whether this slice was worth building, and it is not optional
   * instrumentation. It is also the engagement signal browsers now rate-limit against — Chrome
   * began returning 429 to high-volume, low-engagement senders in January 2026 — so a falling
   * open rate is an early warning that the platform is about to lose the ability to notify at all.
   *
   * Fired from the page, on a message the service worker posts, because a service worker has no
   * PostHog and giving it one would mean giving it a credential (see src/sw.ts).
   */
  | { name: "notif_opened"; type: string }
  | { name: "offline_entered" }
  | { name: "offline_recovered" };

const telemetry = createTelemetry<ShopAnalyticsEvent>({
  key: config.posthogKey(),
  host: config.posthogHost(),
  surface: "shop-web",
  enabled: config.telemetryEnabled(),
});

export const initTelemetry = telemetry.init;
export const track = telemetry.track;
export const reportError = telemetry.reportError;
