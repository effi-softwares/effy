package com.effyshopping.customer.mobile.core.platform

import androidx.compose.runtime.Composable

/**
 * Is the PHONE set to dark mode? (087 — "Match my phone".)
 *
 * ⚠ Not Compose's `isSystemInDarkTheme()` on iOS: that reads the WINDOW's style, and the app sets the
 * window's style itself (to colour the status bar and system sheets), so it would read its own choice
 * back. iOS reads the screen's style instead, which the app does not override.
 */
@Composable
expect fun phoneInDarkMode(): Boolean
