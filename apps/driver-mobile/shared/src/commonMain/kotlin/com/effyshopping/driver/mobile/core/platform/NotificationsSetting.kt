package com.effyshopping.driver.mobile.core.platform

import androidx.compose.runtime.Composable

/**
 * When the driver has turned notifications off, the way to turn them back on (backlog D5): a lambda
 * that opens this app's notification settings. Null when they are on — or when the platform cannot
 * tell, as on iOS until it has push (backlog D3): "off" must never be said of something that isn't.
 *
 * Re-checked each time the app comes back to the foreground, so the row disappears once they have
 * been turned on in Settings.
 */
@Composable
expect fun rememberTurnOnNotifications(): (() -> Unit)?
