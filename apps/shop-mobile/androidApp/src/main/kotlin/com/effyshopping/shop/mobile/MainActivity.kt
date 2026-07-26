package com.effyshopping.shop.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.effyshopping.shop.mobile.app.App
import com.effyshopping.shop.mobile.core.platform.AndroidPlatformUiController

class MainActivity : ComponentActivity() {
    private lateinit var platformUiController: AndroidPlatformUiController

    override fun onCreate(savedInstanceState: Bundle?) {
        // 024 FR-010/FR-011 — MUST be called before super.onCreate() and before setContent.
        // Called later, the window has already been created with the splash theme still attached and
        // the handover to the first Compose frame shows a flash of the wrong background.
        installSplashScreen()
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val container = (application as EffyApp).container
        platformUiController = AndroidPlatformUiController(this, window)
        setContent {
            App(container, platformUiController)
        }
    }

    override fun onDestroy() {
        platformUiController.dispose()
        super.onDestroy()
    }
}
