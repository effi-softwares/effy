package com.effyshopping.customer.mobile.core.observability

/**
 * The typed product-analytics taxonomy for customer-mobile (050 US2). Mirrors the web
 * `StorefrontEvent` union and docs/telemetry/{commerce,platform}-events.md — the SAME names, so a
 * funnel spans customer-web + customer-mobile (FR-010). A `commonTest` drift check asserts every name
 * here is in the documented set.
 *
 * ⚠ ADD AN EVENT HERE FIRST — never a free string at a call site (FR-007). ⚠ NO PII: props are ids +
 * bounded enums only; never an email, name, address, postcode, order total, or search text.
 */
sealed class AnalyticsEvent(val name: String, val props: Map<String, String> = emptyMap()) {
    // Cross-surface (platform-events.md)
    class ScreenViewed(screen: String) : AnalyticsEvent("screen_viewed", mapOf("name" to screen))

    // Commerce funnel (commerce-events.md) — product ids + counts only.
    data object StorefrontViewed : AnalyticsEvent("storefront_viewed")
    class ProductViewed(productId: String) : AnalyticsEvent("product_viewed", mapOf("productId" to productId))
    class ProductAddedToCart(productId: String, quantity: Int) :
        AnalyticsEvent("product_added_to_cart", mapOf("productId" to productId, "quantity" to quantity.toString()))
    data object CartViewed : AnalyticsEvent("cart_viewed")
    data object CheckoutStarted : AnalyticsEvent("checkout_started")
    class OrderPlaced(orderId: String) : AnalyticsEvent("order_placed", mapOf("orderId" to orderId))
    data object SearchPerformed : AnalyticsEvent("search_performed")

    /**
     * 066 — an order was placed with (or without) delivery instructions. `handover` is
     * `leave_at_door` | `meet_at_door` | `none`.
     *
     * ⚠ NEVER THE NOTE, ITS LENGTH OR THE ADDRESS. The note is customer-authored and may hold a gate
     * code; the constructor takes a closed value and two booleans so a call site cannot pass text.
     * ⚠ DECLARED, NOT EMITTED — like the rest of this app's commerce taxonomy, nothing fires it yet.
     */
    class CheckoutDeliveryInstructionsSet(handover: String, hasNote: Boolean, fromSavedDefault: Boolean) :
        AnalyticsEvent(
            "checkout_delivery_instructions_set",
            mapOf("handover" to handover, "hasNote" to hasNote.toString(), "fromSavedDefault" to fromSavedDefault.toString()),
        )

    /**
     * 069 — a same-day slot or a standard day was chosen, or the choice was refused at the payment
     * step. The same three names and props as customer-web's.
     *
     * ⚠ COUNTS AND OFFSETS, NEVER A TIME OR AN ADDRESS. "The third of four slots, six hours ahead"
     * says which slots people want; a slot's clock time joined to a session would say when a
     * household is home. `position` is 1-based among the options shown.
     * ⚠ DECLARED, NOT EMITTED — like the rest of this app's commerce taxonomy, nothing fires them yet.
     */
    class CheckoutDeliverySlotSelected(slotsOffered: Int, position: Int, hoursAhead: Int) :
        AnalyticsEvent(
            "checkout_delivery_slot_selected",
            mapOf("slotsOffered" to slotsOffered.toString(), "position" to position.toString(), "hoursAhead" to hoursAhead.toString()),
        )

    class CheckoutDeliveryDateSelected(daysAhead: Int, wasDefault: Boolean) :
        AnalyticsEvent(
            "checkout_delivery_date_selected",
            mapOf("daysAhead" to daysAhead.toString(), "wasDefault" to wasDefault.toString()),
        )

    /** `reason`: `slot_unavailable` | `date_unavailable` | `slot_required`. */
    class CheckoutDeliveryChoiceRefused(reason: String) :
        AnalyticsEvent("checkout_delivery_choice_refused", mapOf("reason" to reason))

    // 074 — points. ⚠ NO AMOUNTS, NO BALANCE: a balance is account data, not behaviour. The same names
    // and props as customer-web's.
    data object PointsViewed : AnalyticsEvent("points_viewed")
    class CheckoutPointsToggled(on: Boolean) : AnalyticsEvent("checkout_points_toggled", mapOf("on" to on.toString()))
    /** `share`: `part` | `all`. */
    class CheckoutPaidWithPoints(share: String) : AnalyticsEvent("checkout_paid_with_points", mapOf("share" to share))

    // Push (platform-events.md) — the type only, never order/customer data.
    data object PushPermissionPrompted : AnalyticsEvent("push_permission_prompted")
    data object PushPermissionGranted : AnalyticsEvent("push_permission_granted")
    data object PushPermissionDenied : AnalyticsEvent("push_permission_denied")
    class NotificationOpened(type: String) : AnalyticsEvent("notification_opened", mapOf("type" to type))
}
