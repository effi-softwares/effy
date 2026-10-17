package com.effyshopping.driver.mobile.core.presentation

import androidx.compose.runtime.staticCompositionLocalOf

/** The OS "reduce motion" setting, provided once by the app (App.kt) so every screen can honour it. */
val LocalReducedMotion = staticCompositionLocalOf { false }
