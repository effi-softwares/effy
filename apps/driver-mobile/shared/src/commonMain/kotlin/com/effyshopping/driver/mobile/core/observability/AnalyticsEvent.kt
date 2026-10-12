package com.effyshopping.driver.mobile.core.observability

/**
 * The typed product-analytics taxonomy for driver-mobile (050 US2). There is no driver web surface;
 * docs/telemetry/{driver,platform}-events.md is the single source. A `commonTest` drift check asserts
 * every name here is documented.
 *
 * ⚠ ADD AN EVENT HERE FIRST — never a free string at a call site (FR-007). ⚠ NO PII: run ids + bounded
 * enums only — never a customer name, address, order total, or proof-image field (Principle VII).
 *
 * ⚠ EVERY EVENT HERE HAS A CALL SITE NOW, except the three push-permission events (the prompt is
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
     * 065 — a driver opened a package's item list. `surface` is `pickup` | `drop`.
     *
     * ⚠ NO ITEM NAMES AND NO ORDER REFERENCE: what a customer bought is theirs, and three bounded
     * values answer the only questions this event exists for — do drivers open the list, and how
     * often are cold goods involved.
     */
    class ManifestOpened(surface: String, hasCold: Boolean, lineCount: Int) : AnalyticsEvent(
        "driver_manifest_opened",
        mapOf("surface" to surface, "hasCold" to hasCold.toString(), "lineCount" to lineCount.toString()),
    )

    /**
     * ⚠ 064 — THE FR-006 CASE, AND IT CAN ONLY BE OBSERVED HERE.
     *
     * A proof image is PUT straight to S3 against a presigned url; the bytes never pass through
     * Lambda, so when that upload fails the backend sees nothing at all — no request, no error, no
     * log line. The drop correctly stays incomplete and the driver is told to retake the photo, but
     * a SYSTEMATIC failure (a bad network on one device, a broken camera encode, an expired presign)
     * would otherwise be invisible to everyone except the driver standing at the door.
     *
     * ⚠ NO PII, and none is available to leak: the reason is a bounded enum and the drop id is a
     * uuid. Never the image, never the address, never the recipient.
     */
    class ProofUploadFailed(reason: String) :
        AnalyticsEvent("proof_upload_failed", mapOf("reason" to reason))

    // Push (platform-events.md)
    data object PushPermissionPrompted : AnalyticsEvent("push_permission_prompted")
    data object PushPermissionGranted : AnalyticsEvent("push_permission_granted")
    data object PushPermissionDenied : AnalyticsEvent("push_permission_denied")
    class NotificationOpened(type: String) : AnalyticsEvent("notification_opened", mapOf("type" to type))
}
