package com.effyshopping.driver.mobile.core.observability

/**
 * The typed product-analytics taxonomy for driver-mobile. There is no driver web surface;
 * docs/telemetry/{driver,platform}-events.md is the single source. A `commonTest` drift check asserts
 * every name here is documented.
 *
 * Add an event here first - never a free string at a call site. No PII: run ids + bounded
 * enums only - never a customer name, address, order total, or proof-image field (Principle VII).
 *
 * Every event here has a call site now, except the three push-permission events (the prompt is
 * the OS's, raised by the Android activity). For years only `ScreenViewed` was declared with a
 * helper and nothing at all was emitted; the drift test asserts each name is documented and cannot
 * assert that anything fires one, so check `DriverShell` and `AppContainer` before trusting a dashboard.
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

    /**
     * A driver opened a package's item list. `surface` is `pickup` | `drop`.
     *
     * No item names and no order reference: what a customer bought is theirs, and three bounded
     * values answer the only questions this event exists for - do drivers open the list, and how
     * often are cold goods involved.
     */
    class ManifestOpened(surface: String, hasCold: Boolean, lineCount: Int) : AnalyticsEvent(
        "driver_manifest_opened",
        mapOf("surface" to surface, "hasCold" to hasCold.toString(), "lineCount" to lineCount.toString()),
    )

    /**
     * A failed proof upload, observable only here: the image goes straight to S3 on a presigned URL, so the
     * backend never sees the failure. A bounded reason and the drop id; never the image, address or
     * recipient.
     */
    class ProofUploadFailed(reason: String) :
        AnalyticsEvent("proof_upload_failed", mapOf("reason" to reason))

    // Push (platform-events.md)
    data object PushPermissionPrompted : AnalyticsEvent("push_permission_prompted")
    data object PushPermissionGranted : AnalyticsEvent("push_permission_granted")
    data object PushPermissionDenied : AnalyticsEvent("push_permission_denied")
    class NotificationOpened(type: String) : AnalyticsEvent("notification_opened", mapOf("type" to type))
}
