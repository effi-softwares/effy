package com.effyshopping.driver.mobile.core.platform

import androidx.compose.runtime.Composable

/** iOS has no push yet (backlog D3), so there is nothing to say is off. */
@Composable
actual fun rememberTurnOnNotifications(): (() -> Unit)? = null
