package com.effyshopping.customer.mobile.core.presentation

import android.provider.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import com.effyshopping.mobile.kit.ui.MotionLevel

/**
 * Android reads `ANIMATOR_DURATION_SCALE` — the value behind Settings → Accessibility → "Remove
 * animations" (and the developer-options animation scales, which is a useful side effect: a device
 * with animations scaled off in developer options gets the same treatment).
 *
 * ⚠ Compared against zero rather than `< 1f`: a shopper who slowed animations to 0.5× asked for
 * slower animation, not for none.
 */
@Composable
actual fun platformMotionLevel(): MotionLevel {
    val resolver = LocalContext.current.contentResolver
    return remember(resolver) {
        val scale = Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f)
        if (scale == 0f) MotionLevel.None else MotionLevel.Full
    }
}
