package com.effyshopping.shop.mobile

import android.app.Application
import android.util.Log
import com.effyshopping.shop.mobile.app.AppContainer
import com.effyshopping.shop.mobile.core.auth.AmplifyAuthDriver
import com.effyshopping.shop.mobile.core.auth.AmplifyBootstrap

/**
 * The Android application. Configures Amplify ONCE (from the in-code config string — no
 * `amplifyconfiguration.json`, 013 D12) and owns the single [AppContainer] (Principle VI) so it
 * survives activity recreation rather than leaking a new coroutine scope per rotation.
 */
class EffyApp : Application() {

    val container: AppContainer by lazy { AppContainer(authDriver = AmplifyAuthDriver()) }

    override fun onCreate() {
        super.onCreate()
        try {
            AmplifyBootstrap.configure(applicationContext)
        } catch (e: Exception) {
            // A config failure must not crash the app — the login screen still renders, and the driver's
            // currentSession() returns null, so the app lands on SignedOut. Never log tokens (FR-036).
            Log.e("EffyApp", "Amplify configuration failed: ${e.message}")
        }
    }
}
