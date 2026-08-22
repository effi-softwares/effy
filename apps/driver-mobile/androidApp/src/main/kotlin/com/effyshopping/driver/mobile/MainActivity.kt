package com.effyshopping.driver.mobile

import android.os.Build
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.effyshopping.driver.mobile.app.App
import com.effyshopping.driver.mobile.core.platform.AndroidPlatformUiController

class MainActivity : ComponentActivity() {
    private lateinit var platformUiController: AndroidPlatformUiController

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
        setContent {
            App(container, platformUiController)
        }
    }

    override fun onDestroy() {
        platformUiController.dispose()
        super.onDestroy()
    }
}
