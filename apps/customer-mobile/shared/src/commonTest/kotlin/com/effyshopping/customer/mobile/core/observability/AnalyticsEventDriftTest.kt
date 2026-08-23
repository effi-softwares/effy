package com.effyshopping.customer.mobile.core.observability

import kotlin.test.Test
import kotlin.test.assertTrue
import kotlin.test.assertEquals

/**
 * 050 US2 (research R8) — the taxonomy drift check. Every event this app can emit MUST have a name in
 * the documented cross-surface taxonomy (docs/telemetry/{commerce,platform}-events.md), so mobile and
 * web never diverge on names and a funnel spans both. Fails loudly, naming the offender.
 *
 * The documented set is duplicated here deliberately (there is no shared runtime source across the
 * independent mobile builds); if you add an event, add it to the docs AND here.
 */
class AnalyticsEventDriftTest {

    private val documented = setOf(
        // platform-events.md
        "screen_viewed",
        "push_permission_prompted",
        "push_permission_granted",
        "push_permission_denied",
        "notification_opened",
        // commerce-events.md
        "storefront_viewed",
        "product_viewed",
        "product_added_to_cart",
        "cart_viewed",
        "checkout_started",
        "order_placed",
        "search_performed",
    )

    private val allEvents: List<AnalyticsEvent> = listOf(
        AnalyticsEvent.ScreenViewed("home"),
        AnalyticsEvent.StorefrontViewed,
        AnalyticsEvent.ProductViewed("p1"),
        AnalyticsEvent.ProductAddedToCart("p1", 2),
        AnalyticsEvent.CartViewed,
        AnalyticsEvent.CheckoutStarted,
        AnalyticsEvent.OrderPlaced("o1"),
        AnalyticsEvent.SearchPerformed,
        AnalyticsEvent.PushPermissionPrompted,
        AnalyticsEvent.PushPermissionGranted,
        AnalyticsEvent.PushPermissionDenied,
        AnalyticsEvent.NotificationOpened("order_ready"),
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
        // A guard, not a proof: props must be ids/enums/counts, never an email/@ or a long free string.
        for (e in allEvents) {
            for ((k, v) in e.props) {
                assertTrue('@' !in v, "prop '$k' on '${e.name}' looks like an email — no PII (Principle VII)")
            }
        }
    }

    @Test
    fun quantity_is_carried_as_a_string_count() {
        val e = AnalyticsEvent.ProductAddedToCart("p1", 3)
        assertEquals("3", e.props["quantity"])
    }
}
