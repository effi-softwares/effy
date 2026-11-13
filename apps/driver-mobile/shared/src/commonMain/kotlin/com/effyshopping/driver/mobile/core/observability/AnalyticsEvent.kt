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

    // 121 - app updates (platform-events.md, "App updates"). Bounded values and build numbers only.
    /** The update screen or sheet was shown. `level` = mandatory | optional | notice; `platform` = ios | android. */
    class AppUpdatePromptShown(level: String, platform: String, build: Int) :
        AnalyticsEvent("app_update_prompt_shown", mapOf("level" to level, "platform" to platform, "build" to build.toString()))
    /** A choice on it. `action` = update | later | restart | website | call_dispatch. */
    class AppUpdateAction(level: String, action: String) :
        AnalyticsEvent("app_update_action", mapOf("level" to level, "action" to action))
    /** The first launch on a newer build after a prompt. */
    class AppUpdateCompleted(fromBuild: Int, toBuild: Int) :
        AnalyticsEvent("app_update_completed", mapOf("fromBuild" to fromBuild.toString(), "toBuild" to toBuild.toString()))

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
    /** After the screen it leads to (or its fallback, [fallback] = true) has shown (109 FR-018). */
    class NotificationOpened(type: String, fallback: Boolean = false) :
        AnalyticsEvent("notification_opened", mapOf("type" to type, "fallback" to fallback.toString()))

    // 110 - the inbox. Kind and category only, never the words or what an item is about.
    data object InboxOpened : AnalyticsEvent("inbox_opened", mapOf("surface" to "app"))
    class InboxItemOpened(type: String, category: String, fallback: Boolean = false) :
        AnalyticsEvent("inbox_item_opened", mapOf("type" to type, "category" to category, "fallback" to fallback.toString()))
    class InboxItemArchived(type: String, category: String) :
        AnalyticsEvent("inbox_item_archived", mapOf("type" to type, "category" to category))
    class InboxArchiveUndone(type: String, category: String) :
        AnalyticsEvent("inbox_archive_undone", mapOf("type" to type, "category" to category))
    data object InboxMarkedAllRead : AnalyticsEvent("inbox_marked_all_read")
}
