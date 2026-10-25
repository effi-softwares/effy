import { createTelemetry } from "@effy/web-kit"

import { config } from "./env"

type AnalyticsEvent =
  | { name: "auth_sign_in_started" }
  | { name: "auth_otp_submitted" }
  | { name: "auth_sign_in_succeeded"; subject: string }
  | { name: "auth_sign_in_failed"; reason: string }
  | { name: "auth_signed_out" }
  | { name: "sw_update_applied" }
  | { name: "admin_area_access_denied" }
  | { name: "shop_created"; shopId: string }
  | { name: "shop_updated"; shopId: string }
  | { name: "shop_status_changed"; shopId: string }
  | { name: "shop_pack_scanning_changed"; required: boolean }
  | { name: "hub_checkin_scanned"; outcome: string; method: "scan" | "typed" }
  | { name: "promotion_action"; promotionId: string; action: "publish" | "pause" | "resume" | "end" | "archive" }
  | { name: "promotion_group_changed"; groupId: string }
  | { name: "promotion_skin_saved"; skinId: string; layout: string; created: boolean }
  | { name: "promotion_image_added"; promotionId: string }
  | { name: "shop_deleted"; shopId: string }
  | { name: "shop_user_provisioned"; shopId: string }
  | { name: "shop_user_role_changed"; shopId: string }
  | { name: "shop_user_status_changed"; shopId: string }
  | { name: "schema_type_created"; productTypeId: string }
  | { name: "schema_attribute_created"; attributeId: string }
  | { name: "driver_created"; driverId: string }
  | { name: "driver_status_changed"; driverId: string; status: string }
  | { name: "driver_exception_resolved"; kind: string }
  | { name: "driver_work_released"; released: number }
  | {
      name: "product_review_decided"
      productId: string
      kind: "new_product" | "change"
      decision: "approved" | "sent_back"
      marginSet: boolean
    }
  | { name: "product_margin_set"; productId: string }

const telemetry = createTelemetry<AnalyticsEvent>({
  key: config.posthogKey(),
  host: config.posthogHost(),
  surface: "back-office",
  enabled: config.telemetryEnabled(),
})

export const initTelemetry = telemetry.init
export const track = telemetry.track
export const reportError = telemetry.reportError
