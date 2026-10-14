package com.effyshopping.customer.mobile.core.platform

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable

@Composable
actual fun phoneInDarkMode(): Boolean = isSystemInDarkTheme()
