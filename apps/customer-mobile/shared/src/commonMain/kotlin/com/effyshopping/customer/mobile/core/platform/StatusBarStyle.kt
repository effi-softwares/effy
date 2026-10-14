package com.effyshopping.customer.mobile.core.platform

import androidx.compose.runtime.Composable

/**
 * Sets the status-bar (and Android navigation-bar) icons: LIGHT on a dark ground (the launch intro, the
 * dark theme), DARK on a light one (087). The last caller wins; nothing is reset on leaving.
 */
@Composable
expect fun StatusBarIcons(lightIcons: Boolean)
