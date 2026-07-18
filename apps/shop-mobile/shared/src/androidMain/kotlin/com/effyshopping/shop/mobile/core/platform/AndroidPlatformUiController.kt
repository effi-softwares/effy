package com.effyshopping.shop.mobile.core.platform

import android.content.Context
import android.database.ContentObserver
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Window
import androidx.core.view.WindowCompat
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class AndroidPlatformUiController(
    private val context: Context,
    private val window: Window,
) : PlatformUiController {
    private val mutableState = MutableStateFlow(PlatformUiState(readReducedMotion()))
    override val state: StateFlow<PlatformUiState> = mutableState.asStateFlow()

    private val animationObserver = object : ContentObserver(Handler(Looper.getMainLooper())) {
        override fun onChange(selfChange: Boolean) {
            mutableState.value = PlatformUiState(readReducedMotion())
        }
    }

    init {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        context.contentResolver.registerContentObserver(
            Settings.Global.getUriFor(Settings.Global.ANIMATOR_DURATION_SCALE),
            false,
            animationObserver,
        )
    }

    @Suppress("DEPRECATION")
    override fun applyAppearance(isDark: Boolean) {
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = !isDark
            isAppearanceLightNavigationBars = !isDark
        }
    }

    override fun dispose() {
        context.contentResolver.unregisterContentObserver(animationObserver)
    }

    private fun readReducedMotion(): Boolean =
        Settings.Global.getFloat(
            context.contentResolver,
            Settings.Global.ANIMATOR_DURATION_SCALE,
            1f,
        ) == 0f
}
