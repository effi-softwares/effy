package com.effyshopping.driver.mobile.core.push

/** A notification the driver tapped: its type and, for a round, the round's id (backlog D4). */
data class OpenedNotification(val type: String, val entityId: String? = null)
