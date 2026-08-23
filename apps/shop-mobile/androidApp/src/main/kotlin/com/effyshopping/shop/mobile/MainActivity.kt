package com.effyshopping.shop.mobile

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.effyshopping.shop.mobile.app.App
import com.effyshopping.shop.mobile.core.platform.AndroidPlatformUiController

class MainActivity : ComponentActivity() {
    private lateinit var platformUiController: AndroidPlatformUiController

    // 050 T046 — Android 13+ notification permission (registered before STARTED). Result ignored:
    // denial just means no push shown (FR-019); the FCM token still registers.
    private val requestNotifications =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        // 024 FR-010/FR-011 — MUST be called before super.onCreate() and before setContent.
        // Called later, the window has already been created with the splash theme still attached and
        // the handover to the first Compose frame shows a flash of the wrong background.
        installSplashScreen()
        // ⚠ NOT the no-arg `enableEdgeToEdge()`. Its DEFAULT `navigationBarStyle` is
        // `SystemBarStyle.auto(DefaultLightScrim, DefaultDarkScrim)` — a 90%-white / 50%-dark scrim the
        // framework paints over the navigation bar on API ≤ 28, and on API 29+ it sets
        // `isNavigationBarContrastEnforced = true`, which makes the system draw its own scrim in
        // 3-button mode. Either way the bar area ends up a different shade from the app, which is
        // exactly the seam this is here to remove. Transparent on both sides, contrast enforcement off.
        //
        // Dark-mode DETECTION is left at `auto`'s default, so the system-bar ICONS still flip with the
        // device appearance — which is correct here because the app's theme follows the device too.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.isStatusBarContrastEnforced = false
            window.isNavigationBarContrastEnforced = false
        }
        super.onCreate(savedInstanceState)
        val container = (application as EffyApp).container
        platformUiController = AndroidPlatformUiController(this, window)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            requestNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        setContent {
            App(container, platformUiController)
        }
    }

    override fun onDestroy() {
        platformUiController.dispose()
        super.onDestroy()
    }
}
