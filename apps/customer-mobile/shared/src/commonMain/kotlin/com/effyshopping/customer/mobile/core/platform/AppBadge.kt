package com.effyshopping.customer.mobile.core.platform

import androidx.compose.runtime.Composable

/**
 * Clears the number or dot on the app's icon once the inbox has been seen (110 R8). iOS: the badge count goes to 0;
 * Android: the app's shown notifications are cancelled, which takes the launcher dot with them.
 */
@Composable
expect fun rememberClearAppBadge(): () -> Unit
