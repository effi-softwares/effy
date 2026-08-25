package com.effyshopping.customer.mobile

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
import com.effyshopping.customer.mobile.app.App

class MainActivity : ComponentActivity() {

    // ⚠ NO PAYMENT SHEET IS REGISTERED HERE (051). 019 built Stripe's `PaymentSheet` in onCreate so its
    // ActivityResultLauncher was registered in time, and the shared driver presented through it. Paying
    // now happens inside Effy's own payment screen, through a Compose-scoped embedded element that
    // registers its own launchers — so the Activity has nothing to own and nothing to tear down.

    // 050 T046 — the Android 13+ runtime notification permission. Registered before STARTED (field
    // initializer). The result is intentionally ignored: a denial just means no push is shown (FR-019),
    // and the FCM token still registers (token generation does not need this permission).
    private val requestNotifications =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* granted or not — no-op */ }

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

        // 050 T046 — ask for notification permission on Android 13+ (older versions grant it at
        // install). Pre-33 devices need no prompt; the check keeps it silent there.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            requestNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        setContent {
            App(container)
        }
    }

}
