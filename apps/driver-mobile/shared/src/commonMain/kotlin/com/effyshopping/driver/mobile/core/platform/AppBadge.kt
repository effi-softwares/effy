package com.effyshopping.driver.mobile.core.platform

import androidx.compose.runtime.Composable

/**
 * Puts the unseen count on the app's icon (110 R8; 116 FR-015). iOS: the icon shows the number. Android: no number can
 * be set - the launcher counts the notifications on screen - so 0 takes Effy's shown notifications away, and any other
 * number leaves them (the silent corrections keep them to the unseen ones, `badgeCancellations`).
 */
@Composable
expect fun rememberSetAppBadge(): (Int) -> Unit
