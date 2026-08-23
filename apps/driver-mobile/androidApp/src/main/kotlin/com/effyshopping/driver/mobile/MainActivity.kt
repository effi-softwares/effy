package com.effyshopping.driver.mobile

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
import com.effyshopping.driver.mobile.app.App
import com.effyshopping.driver.mobile.core.platform.AndroidMapLauncher
import com.effyshopping.driver.mobile.core.platform.AndroidPlatformUiController

class MainActivity : ComponentActivity() {
    private lateinit var platformUiController: AndroidPlatformUiController

    // 050 T046 — Android 13+ notification permission (registered before STARTED). Result ignored:
    // denial just means no push shown (FR-019); the FCM token still registers.
    private val requestNotifications =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
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
            App(container, platformUiController, AndroidMapLauncher(applicationContext))
        }
    }

    override fun onDestroy() {
        platformUiController.dispose()
        super.onDestroy()
    }
}
