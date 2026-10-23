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

    // No payment sheet is registered here. 019 built Stripe's `PaymentSheet` in onCreate so its
    // ActivityResultLauncher was registered in time, and the shared driver presented through it. Paying
    // now happens inside Effy's own payment screen, through a Compose-scoped embedded element that
    // registers its own launchers — so the Activity has nothing to own and nothing to tear down.

    // The Android 13+ runtime notification permission. Registered before started (field
    // initializer). The result is intentionally ignored: a denial just means no push is shown,
    // and the FCM token still registers (token generation does not need this permission).
    private val requestNotifications =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* granted or not — no-op */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        // Before super.onCreate and setContent, or the window is created with the splash theme still attached
        // and the first frame flashes the wrong background. The system splash is removed instantly once the
        // first Compose frame (EffyIntro, drawn identically) is ready; a fade would cross-dissolve two identical
        // images and read as a flicker.
        installSplashScreen().setOnExitAnimationListener { it.remove() }
        // Not the no-arg `enableEdgeToEdge`. Its default `navigationBarStyle` is
        // `SystemBarStyle.auto(DefaultLightScrim, DefaultDarkScrim)` — a 90%-white / 50%-dark scrim the
        // framework paints over the navigation bar on API ≤ 28, and on API 29+ it sets
        // `isNavigationBarContrastEnforced = true`, which makes the system draw its own scrim in
        // 3-button mode. Either way the bar area ends up a different shade from the app, which is
        // exactly the seam this is here to remove. Transparent on both sides, contrast enforcement off.
        //
        // `light`, not `auto`: the app is light only (storefront identity), so the system-bar
        // icons must stay dark on the white ground even when the device is in dark mode. With `auto`
        // a dark-mode phone drew white status icons on a white page — invisible.
        enableEdgeToEdge(
            // Light icons to start: the splash and the launch intro are dark. From then on the app sets
            // them to its appearance (StatusBarIcons) — light icons on the dark theme, dark on the light.
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.isStatusBarContrastEnforced = false
            window.isNavigationBarContrastEnforced = false
        }
        super.onCreate(savedInstanceState)
        val container = (application as EffyApp).container

        // Ask for notification permission on Android 13+ (older versions grant it at
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
