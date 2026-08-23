package com.effyshopping.driver.mobile.core.observability

/**
 * The typed product-analytics taxonomy for driver-mobile (050 US2). There is no driver web surface;
 * docs/telemetry/{driver,platform}-events.md is the single source. A `commonTest` drift check asserts
 * every name here is documented.
 *
 * ⚠ ADD AN EVENT HERE FIRST — never a free string at a call site (FR-007). ⚠ NO PII: run ids + bounded
 * enums only — never a customer name, address, order total, or proof-image field (Principle VII).
 */
sealed class AnalyticsEvent(val name: String, val props: Map<String, String> = emptyMap()) {
    // Cross-surface (platform-events.md)
    class ScreenViewed(screen: String) : AnalyticsEvent("screen_viewed", mapOf("name" to screen))

    // Driver workflow (driver-events.md)
    class DutyToggled(on: Boolean) : AnalyticsEvent("driver_duty_toggled", mapOf("on" to on.toString()))
    class CollectionRunOpened(runId: String) : AnalyticsEvent("collection_run_opened", mapOf("runId" to runId))
    class ShopStopCollected(runId: String) : AnalyticsEvent("shop_stop_collected", mapOf("runId" to runId))
    class HubCheckedIn(runId: String) : AnalyticsEvent("hub_checked_in", mapOf("runId" to runId))
    class DeliveryRunOpened(runId: String) : AnalyticsEvent("delivery_run_opened", mapOf("runId" to runId))
    class DropCompleted(proof: String) : AnalyticsEvent("drop_completed", mapOf("proof" to proof))

    // Push (platform-events.md)
    data object PushPermissionPrompted : AnalyticsEvent("push_permission_prompted")
    data object PushPermissionGranted : AnalyticsEvent("push_permission_granted")
    data object PushPermissionDenied : AnalyticsEvent("push_permission_denied")
    class NotificationOpened(type: String) : AnalyticsEvent("notification_opened", mapOf("type" to type))
}
