package com.effyshopping.customer.mobile

import android.app.Application
import android.util.Log
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.auth.AmplifyAuthDriver
import com.effyshopping.customer.mobile.core.auth.AmplifyBootstrap
import com.effyshopping.customer.mobile.core.payment.AndroidPaymentDriver

/**
 * The Android application. Configures Amplify ONCE (from the in-code config string — no
 * `amplifyconfiguration.json`, D12) and owns the single [AppContainer] (Principle VI) so it survives
 * activity recreation rather than leaking a new coroutine scope per rotation.
 */
class EffyApp : Application() {

    val container: AppContainer by lazy {
        AppContainer(authDriver = AmplifyAuthDriver(), paymentDriver = AndroidPaymentDriver())
    }

    override fun onCreate() {
        super.onCreate()
        try {
            AmplifyBootstrap.configure(applicationContext)
        } catch (e: Exception) {
            // A config failure must not crash the app — the guest experience still works, and the
            // driver's currentSession() returns null, landing on Guest. Never log tokens (FR-038).
            Log.e("EffyApp", "Amplify configuration failed: ${e.message}")
        }
    }
}
