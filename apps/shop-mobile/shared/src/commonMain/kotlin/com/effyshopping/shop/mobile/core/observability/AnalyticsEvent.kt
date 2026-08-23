package com.effyshopping.shop.mobile.core.observability

/**
 * The typed product-analytics taxonomy for shop-mobile (050 US2). Mirrors shop-web's `ShopAnalyticsEvent`
 * union and docs/telemetry/{fulfillment,platform}-events.md — the SAME names, so a funnel spans
 * shop-web + shop-mobile (FR-010). A `commonTest` drift check asserts every name here is documented.
 *
 * ⚠ ADD AN EVENT HERE FIRST — never a free string at a call site (FR-007). ⚠ NO PII, and tighter here:
 * these describe an operator handling a REAL customer's order — `fulfillmentId` (a unit of work) only,
 * never an order number, shop id, product name, customer detail, or shortfall quantity.
 */
sealed class AnalyticsEvent(val name: String, val props: Map<String, String> = emptyMap()) {
    // Cross-surface (platform-events.md)
    class ScreenViewed(screen: String) : AnalyticsEvent("screen_viewed", mapOf("name" to screen))

    // Fulfilment workflow (fulfillment-events.md)
    class OrderQueueViewed(state: String) : AnalyticsEvent("shop_order_queue_viewed", mapOf("state" to state))
    class OrderOpened(fulfillmentId: String, status: String) :
        AnalyticsEvent("shop_order_opened", mapOf("fulfillmentId" to fulfillmentId, "status" to status))
    class OrderStateChanged(fulfillmentId: String, from: String, to: String) :
        AnalyticsEvent("shop_order_state_changed", mapOf("fulfillmentId" to fulfillmentId, "from" to from, "to" to to))
    class OrderReversed(fulfillmentId: String) : AnalyticsEvent("shop_order_reversed", mapOf("fulfillmentId" to fulfillmentId))
    class OrderItemGathered(fulfillmentId: String) : AnalyticsEvent("shop_order_item_gathered", mapOf("fulfillmentId" to fulfillmentId))

    // Push (platform-events.md)
    data object PushPermissionPrompted : AnalyticsEvent("push_permission_prompted")
    data object PushPermissionGranted : AnalyticsEvent("push_permission_granted")
    data object PushPermissionDenied : AnalyticsEvent("push_permission_denied")
    class NotificationOpened(type: String) : AnalyticsEvent("notification_opened", mapOf("type" to type))
}
