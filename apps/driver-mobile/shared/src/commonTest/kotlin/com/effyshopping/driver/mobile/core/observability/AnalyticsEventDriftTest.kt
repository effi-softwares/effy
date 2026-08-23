package com.effyshopping.driver.mobile.core.observability

import kotlin.test.Test
import kotlin.test.assertTrue

/**
 * 050 US2 (research R8) — the taxonomy drift check. Every event driver-mobile can emit MUST have a name
 * in the documented taxonomy (docs/telemetry/{driver,platform}-events.md). Fails loudly, naming the
 * offender.
 */
class AnalyticsEventDriftTest {

    private val documented = setOf(
        "screen_viewed",
        "push_permission_prompted",
        "push_permission_granted",
        "push_permission_denied",
        "notification_opened",
        "driver_duty_toggled",
        "collection_run_opened",
        "shop_stop_collected",
        "hub_checked_in",
        "delivery_run_opened",
        "drop_completed",
    )

    private val allEvents: List<AnalyticsEvent> = listOf(
        AnalyticsEvent.ScreenViewed("today"),
        AnalyticsEvent.DutyToggled(true),
        AnalyticsEvent.CollectionRunOpened("r1"),
        AnalyticsEvent.ShopStopCollected("r1"),
        AnalyticsEvent.HubCheckedIn("r1"),
        AnalyticsEvent.DeliveryRunOpened("r2"),
        AnalyticsEvent.DropCompleted("delivery_code"),
        AnalyticsEvent.PushPermissionPrompted,
        AnalyticsEvent.PushPermissionGranted,
        AnalyticsEvent.PushPermissionDenied,
        AnalyticsEvent.NotificationOpened("run_assigned"),
    )

    @Test
    fun every_emitted_event_name_is_documented() {
        for (e in allEvents) {
            assertTrue(
                e.name in documented,
                "AnalyticsEvent '${e.name}' is not in the documented taxonomy — add it to docs/telemetry.",
            )
        }
    }

    @Test
    fun no_prop_value_looks_like_pii() {
        for (e in allEvents) {
            for ((k, v) in e.props) {
                assertTrue('@' !in v, "prop '$k' on '${e.name}' looks like an email — no PII (Principle VII)")
            }
        }
    }
}
