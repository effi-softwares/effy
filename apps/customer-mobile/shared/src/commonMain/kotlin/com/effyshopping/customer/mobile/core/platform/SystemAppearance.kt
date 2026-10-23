package com.effyshopping.customer.mobile.core.platform

import androidx.compose.runtime.Composable

/**
 * Is the phone set to dark mode ("Match my phone")? On iOS not `isSystemInDarkTheme`, which reads the
 * window's style, which the app sets itself; iOS reads the screen's style instead.
 */
@Composable
expect fun phoneInDarkMode(): Boolean
