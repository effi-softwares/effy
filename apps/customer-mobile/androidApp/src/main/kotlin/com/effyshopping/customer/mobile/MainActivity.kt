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
import com.effyshopping.customer.mobile.core.payment.AndroidPaymentDriver
import com.effyshopping.customer.mobile.core.payment.PaymentPresenter
import com.effyshopping.customer.mobile.core.payment.PaymentResult
import com.stripe.android.PaymentConfiguration
import com.stripe.android.paymentsheet.PaymentSheet
import com.stripe.android.paymentsheet.PaymentSheetResult

class MainActivity : ComponentActivity() {

    // 019 US3 — the real Stripe PaymentSheet. It MUST be constructed here, in onCreate and before the
    // Activity is STARTED, so its ActivityResultLauncher is registered in time. The shared
    // AndroidPaymentDriver presents through it via a PaymentPresenter and receives the result back.
    private lateinit var paymentSheet: PaymentSheet
    private lateinit var paymentDriver: AndroidPaymentDriver
    private lateinit var paymentPresenter: PaymentPresenter

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

        // Register the PaymentSheet + bridge it to the shared driver (see field docs above).
        paymentSheet = PaymentSheet(this, ::onPaymentSheetResult)
        paymentDriver = container.paymentDriver as AndroidPaymentDriver
        paymentPresenter = PaymentPresenter { clientSecret, publishableKey ->
            // Stripe needs the publishable key initialised before the sheet is presented; the key is
            // the client's own build-time value, forwarded from the shared PayForOrder use case.
            PaymentConfiguration.init(applicationContext, publishableKey)
            paymentSheet.presentWithPaymentIntent(
                clientSecret,
                PaymentSheet.Configuration.Builder("Effy").build(),
            )
        }
        paymentDriver.attach(paymentPresenter)

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

    override fun onDestroy() {
        // A recreated Activity registers a fresh PaymentSheet; drop this one so a stale sheet is never
        // presented after the Activity is gone.
        if (::paymentDriver.isInitialized) paymentDriver.detach(paymentPresenter)
        super.onDestroy()
    }

    private fun onPaymentSheetResult(result: PaymentSheetResult) {
        val mapped = when (result) {
            is PaymentSheetResult.Completed -> PaymentResult.Completed
            is PaymentSheetResult.Canceled -> PaymentResult.Canceled
            is PaymentSheetResult.Failed ->
                PaymentResult.Failed(result.error.localizedMessage ?: "Payment failed")
        }
        paymentDriver.deliverResult(mapped)
    }
}
