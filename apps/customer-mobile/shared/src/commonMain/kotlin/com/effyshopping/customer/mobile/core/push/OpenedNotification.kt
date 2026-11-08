package com.effyshopping.customer.mobile.core.push

/**
 * A notification the shopper tapped (109): its type (for the `notification_opened` event), the notification's id
 * (to record it read, and to check it is theirs after a sign-in) and where it leads, as the push carried it
 * (`destination`, compact JSON - see [parseCustomerDestination]).
 *
 * Set by each platform's tap handler (Android `PushOpen`, iOS `IosPushOpen`) and consumed once by the shell.
 */
data class OpenedNotification(
    val type: String,
    val notificationId: String?,
    val destination: String?,
)
