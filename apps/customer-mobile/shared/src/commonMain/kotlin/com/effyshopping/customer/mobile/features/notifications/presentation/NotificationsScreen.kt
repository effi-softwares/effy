package com.effyshopping.customer.mobile.features.notifications.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.effyshopping.customer.mobile.core.platform.rememberOpenAppSettings
import com.effyshopping.customer.mobile.core.presentation.EffyAppBar
import com.effyshopping.customer.mobile.core.presentation.EffyEmptyState
import com.effyshopping.customer.mobile.core.presentation.EffyGroup
import com.effyshopping.customer.mobile.core.presentation.EffyNavRow
import com.effyshopping.customer.mobile.core.presentation.EffyRowIcon
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.lucide_bell
import com.effyshopping.customer.mobile.resources.lucide_settings
import com.effyshopping.mobile.design.EffySpacing

/**
 * Notifications (Notifications board; 087 FR-037).
 *
 * ⚠ AN HONEST EMPTY STATE, NOT A LIST. The platform does not keep a customer's sent notifications, so
 * there is nothing to show; the list is DEFERRED to a later feature (087 spec, Q1). Until then this
 * page says so plainly and offers the one useful thing it can: the system's notification settings,
 * where a shopper who missed an order update turns them on. (087 deleted `NotificationFixtures`, which
 * always returned an empty list behind a list layout nothing could fill.)
 */
@Composable
fun NotificationsScreen() {
    val openSettings = rememberOpenAppSettings()
    Column(modifier = Modifier.fillMaxSize()) {
        EffyAppBar(title = "Notifications")
        Column(modifier = Modifier.weight(1f).fillMaxWidth()) {
            EffyEmptyState(
                title = "You're all caught up",
                body = "When there's news about an order, we'll let you know here and on your phone.",
                icon = Res.drawable.lucide_bell,
                modifier = Modifier.weight(1f),
            )
            EffyGroup(modifier = Modifier.padding(EffySpacing.lg)) {
                EffyNavRow(
                    "Notification settings",
                    leading = { EffyRowIcon(Res.drawable.lucide_settings) },
                    supporting = "Choose what Effy can tell you about",
                    onClick = openSettings,
                    divider = false,
                )
            }
        }
    }
}
