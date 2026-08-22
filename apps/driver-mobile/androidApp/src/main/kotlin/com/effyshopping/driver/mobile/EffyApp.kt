package com.effyshopping.driver.mobile

import android.app.Application
import android.util.Log
import com.effyshopping.driver.mobile.app.AppContainer
import com.effyshopping.driver.mobile.core.auth.AmplifyAuthDriver
import com.effyshopping.driver.mobile.core.auth.AmplifyBootstrap

/**
 * The Android application (049). Configures Amplify ONCE from the in-code config string (no
 * `amplifyconfiguration.json`, D12) and owns the single [AppContainer] (Principle VI) so it survives
 * activity recreation rather than leaking a coroutine scope per rotation.
 */
class EffyApp : Application() {

    val container: AppContainer by lazy { AppContainer(authDriver = AmplifyAuthDriver()) }

    override fun onCreate() {
        super.onCreate()
        try {
            AmplifyBootstrap.configure(applicationContext)
        } catch (e: Exception) {
            // A config failure must not crash the app — the sign-in screen still renders, and
            // currentSession() returns null, so the app lands on SignedOut. Never log tokens.
            Log.e("EffyApp", "Amplify configuration failed: ${e.message}")
        }
    }
}
