package com.effyshopping.driver.mobile.core.push

/**
 * A notification the driver tapped (109): its type (for the `notification_opened` event), the notification's id (to
 * record it read, and to check it is theirs after a sign-in) and where it leads, as the push carried it
 * (`destination`, compact JSON - see [parseDriverDestination]).
 */
data class OpenedNotification(
    val type: String,
    val notificationId: String? = null,
    val destination: String? = null,
)
