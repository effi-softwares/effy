package com.effyshopping.customer.mobile.features.auth

import com.effyshopping.customer.mobile.core.config.AppConfig
import kotlin.test.Test
import kotlin.test.assertFalse

/**
 * 087 FR-033 — "Continue with Google" is never a button that does nothing.
 *
 * Google federation is parked platform-wide (`customer_google_enabled = false`). While it is, the app
 * must not show the button. Flipping this flag is a deliberate act that belongs with the feature that
 * wires native Google sign-in — this test then changes with it.
 */
class GoogleSignInGateTest {
    @Test
    fun `the Google button is hidden while federation is parked`() {
        assertFalse(AppConfig.googleSignInEnabled)
    }
}
