package com.effyshopping.shop.mobile.core.observability

import kotlin.test.Test
import kotlin.test.assertTrue

/**
 * 050 US2 (research R8) — the taxonomy drift check. Every event shop-mobile can emit MUST have a name
 * in the documented cross-surface taxonomy (docs/telemetry/{fulfillment,platform}-events.md), so
 * shop-web and shop-mobile never diverge on names. Fails loudly, naming the offender.
 */
class AnalyticsEventDriftTest {

    private val documented = setOf(
        "screen_viewed",
        "push_permission_prompted",
        "push_permission_granted",
        "push_permission_denied",
        "notification_opened",
        "shop_order_queue_viewed",
        "shop_order_opened",
        "shop_order_state_changed",
        "shop_order_reversed",
        "shop_order_item_gathered",
    )

    private val allEvents: List<AnalyticsEvent> = listOf(
        AnalyticsEvent.ScreenViewed("home"),
        AnalyticsEvent.OrderQueueViewed("active"),
        AnalyticsEvent.OrderOpened("f1", "picking"),
        AnalyticsEvent.OrderStateChanged("f1", "received", "picking"),
        AnalyticsEvent.OrderReversed("f1"),
        AnalyticsEvent.OrderItemGathered("f1"),
        AnalyticsEvent.PushPermissionPrompted,
        AnalyticsEvent.PushPermissionGranted,
        AnalyticsEvent.PushPermissionDenied,
        AnalyticsEvent.NotificationOpened("shop_new_order"),
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
