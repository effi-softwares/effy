import { createTelemetry } from "@effy/web-kit"

import { config } from "./env"

type ShopAnalyticsEvent =
  | { name: "shop_auth_sign_in_started" }
  | { name: "shop_auth_otp_submitted" }
  | { name: "shop_auth_sign_in_succeeded"; subject: string }
  | { name: "shop_auth_sign_in_failed"; reason: string }
  | { name: "shop_auth_signed_out" }
  | { name: "shop_assignment_missing" }
  | { name: "product_create_started" }
  | { name: "product_created"; productId: string }
  | { name: "product_edit_saved"; productId: string }
  | { name: "product_variants_saved"; productId: string; variantCount: number }
  | { name: "stock_table_saved"; productId: string; mode: "receive" | "count"; sizes: number }
  | { name: "product_variant_state_changed"; productId: string; state: "active" | "inactive" | "removed" }
  | { name: "product_archived"; productId: string }
  | { name: "product_submitted_for_review"; productId: string }
  | { name: "product_review_withdrawn"; productId: string }
  | { name: "catalog_search" }
  | { name: "catalog_filter_applied" }
  | { name: "availability_viewed" }
  | { name: "availability_toggled"; onSale: boolean }
  | { name: "collection_panel_viewed"; driver: string }
  | { name: "shop_order_queue_viewed"; state: "active" | "completed" }
  | { name: "shop_order_opened"; fulfillmentId: string; status: string }
  | { name: "shop_order_state_changed"; fulfillmentId: string; from: string; to: string }
  | { name: "shop_order_reversed"; fulfillmentId: string }
  | { name: "shop_order_item_gathered"; fulfillmentId: string }
  | { name: "shop_order_item_unavailable"; fulfillmentId: string }
  | { name: "shop_order_item_restored"; fulfillmentId: string }
  | { name: "shop_refund_initiated"; fulfillmentId: string }
  | { name: "shop_labels_printed"; fulfillmentId: string; layout: string; count: number }
  // Bags. Counts and ids only; never a code, name or address.
  | { name: "parcels_declared"; fulfillmentId: string; count: number }
  | { name: "labels_printed"; orders: number; count: number; layout: string; path: string }
  | { name: "pack_scanned"; fulfillmentId: string }
  | { name: "shop_staff_invited"; role: string }
  | { name: "shop_staff_deactivated" }
  | { name: "today_viewed" }
  | { name: "today_attention_acted"; kind: string }
  | { name: "quick_action_used"; action: string }
  | { name: "insights_viewed"; range: string }
  | { name: "insights_range_changed"; range: string }
  | { name: "insights_drilled"; metric: string }
  | { name: "insights_exported"; range: string }
  | { name: "pwa_install_prompted"; method: string }
  | { name: "pwa_installed" }
  | { name: "sw_update_applied" }
  | { name: "notif_permission_requested" }
  | { name: "notif_permission_result"; result: string }
  | { name: "notif_enabled" }
  | { name: "notif_disabled" }
  | { name: "notif_type_muted"; type: string }
  | { name: "notif_type_unmuted"; type: string }
  | { name: "notif_opened"; type: string }
  | { name: "offline_entered" }
  | { name: "offline_recovered" }

const telemetry = createTelemetry<ShopAnalyticsEvent>({
  key: config.posthogKey(),
  host: config.posthogHost(),
  surface: "shop-web",
  enabled: config.telemetryEnabled(),
})

export const initTelemetry = telemetry.init
export const track = telemetry.track
export const reportError = telemetry.reportError
