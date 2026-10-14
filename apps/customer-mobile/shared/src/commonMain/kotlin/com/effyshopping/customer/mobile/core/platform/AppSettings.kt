package com.effyshopping.customer.mobile.core.platform

import androidx.compose.runtime.Composable

/**
 * Opens this app's page in the system Settings (087 T078) — where a shopper turns notifications on or
 * off. Android: the app-details screen; iOS: the app's Settings page.
 */
@Composable
expect fun rememberOpenAppSettings(): () -> Unit
