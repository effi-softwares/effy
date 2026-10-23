package com.effyshopping.customer.mobile.core.platform

import androidx.compose.runtime.Composable

/**
 * Sets the status-bar (and Android navigation-bar) icons: Light on a dark ground (the launch intro, the
 * dark theme), dark on a light one. The last caller wins; nothing is reset on leaving.
 */
@Composable
expect fun StatusBarIcons(lightIcons: Boolean)
