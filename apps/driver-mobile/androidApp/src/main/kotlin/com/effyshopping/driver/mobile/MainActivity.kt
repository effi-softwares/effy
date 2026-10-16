package com.effyshopping.driver.mobile

import android.content.Intent
import android.os.Build
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.effyshopping.driver.mobile.app.App
import com.effyshopping.driver.mobile.core.platform.AndroidMapLauncher
import com.effyshopping.driver.mobile.core.platform.AndroidPlatformUiController
import com.effyshopping.driver.mobile.core.push.PushOpen

class MainActivity : ComponentActivity() {
    private lateinit var platformUiController: AndroidPlatformUiController

    override fun onCreate(savedInstanceState: Bundle?) {
        // 092 — as the customer app: installed BEFORE super.onCreate, and removed INSTANTLY once the first
        // Compose frame is ready — that frame is the launch intro, drawn identically to the splash, so a
        // system fade would only cross-dissolve two identical images.
        installSplashScreen().setOnExitAnimationListener { it.remove() }
        // Light icons to start: the splash and the intro are dark. After the intro the app sets them to
        // its appearance (applyAppearance).
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.isStatusBarContrastEnforced = false
            window.isNavigationBarContrastEnforced = false
        }
        super.onCreate(savedInstanceState)
        val container = (application as EffyApp).container
        // Opened by tapping a notification: tell the shell, which goes to the driver's work.
        PushOpen.consume(intent)?.let { container.openedNotification.value = it }
        platformUiController = AndroidPlatformUiController(this, window)
        // ⚠ Notification permission is NOT asked for here (backlog D5). It was, on every launch, before
        // the permission explanation screen — so a driver saw two prompts, and one that came with no
        // reason. That screen asks, once; a refusal shows "Notifications are off" on Today and Account.
        setContent {
            App(container, platformUiController, AndroidMapLauncher(applicationContext))
        }
    }

    /** A notification tapped while the app was already open arrives here, not in [onCreate]. */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        PushOpen.consume(intent)?.let { (application as EffyApp).container.openedNotification.value = it }
    }

    override fun onDestroy() {
        platformUiController.dispose()
        super.onDestroy()
    }
}
