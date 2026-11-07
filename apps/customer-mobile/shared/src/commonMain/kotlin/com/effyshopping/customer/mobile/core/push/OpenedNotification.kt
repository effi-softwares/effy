package com.effyshopping.customer.mobile.core.push

/**
 * A notification the shopper tapped: its type (for the `notification_opened` event) and the deep link
 * the notifications worker sent beside it (`dataFor` in `apis/edge-api/notifications/src/worker/copy.ts`).
 * Set by each platform's tap handler (Android `PushOpen`, iOS `IosPushOpen`) and consumed once by the shell.
 */
data class OpenedNotification(val type: String, val deepLink: String?)

/** Where a tapped notification takes the shopper. */
sealed interface PushDestination {
    /** One order's page, under the Orders tab. */
    data class Order(val orderId: String) : PushDestination

    /** The Orders tab - the link names no order (a courier hand-over or a delivery change). */
    data object Orders : PushDestination

    /** Effy points, under the Account tab. */
    data object Points : PushDestination
}

/**
 * The destination of a worker deep link, or null when the app has no screen for it (it then just opens).
 *
 * The SERVER decides whether an order id belongs in the link (`entityInLink` in copy.ts): `effy://order/<id>`
 * for an order's own events, a bare `effy://order` when the entity is something else (a consignment, an
 * override). So the app reads the link, never the entity id - an override id must never be opened as an order.
 */
fun pushDestination(deepLink: String?): PushDestination? {
    val rest = deepLink?.trim()?.removePrefix("effy://") ?: return null
    if (rest == deepLink.trim()) return null // not one of ours
    val parts = rest.trimEnd('/').split('/')
    return when (parts.firstOrNull()) {
        "order" -> parts.getOrNull(1)?.takeIf { it.isNotBlank() }?.let { PushDestination.Order(it) } ?: PushDestination.Orders
        "points" -> PushDestination.Points
        else -> null
    }
}
