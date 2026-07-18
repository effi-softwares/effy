package com.effyshopping.shop.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.effyshopping.shop.mobile.app.App
import com.effyshopping.shop.mobile.core.platform.AndroidPlatformUiController

class MainActivity : ComponentActivity() {
    private lateinit var platformUiController: AndroidPlatformUiController

    override fun onCreate(savedInstanceState: Bundle?) {
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
