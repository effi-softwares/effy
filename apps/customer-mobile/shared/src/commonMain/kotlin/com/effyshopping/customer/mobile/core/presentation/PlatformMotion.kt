package com.effyshopping.customer.mobile.core.presentation

import androidx.compose.runtime.Composable
import com.effyshopping.mobile.kit.ui.MotionLevel

/**
 * The device's reduced-motion preference (025 FR-037).
 *
 * Provided into [com.effyshopping.mobile.kit.ui.LocalMotionLevel] once, at the app root, so every
 * screen below reads one value rather than each asking the OS.
 *
 * ⚠ The two platforms do NOT mean the same thing by their setting, and this deliberately does not
 * flatten them into one boolean:
 *
 *  - **Android — "Remove animations"** turns animation OFF. The scale it writes is literally zero, so
 *    [MotionLevel.None] is the honest reading.
 *  - **iOS — "Reduce Motion"** asks for animation to be SUBSTITUTED, not removed: the platform
 *    convention is to cross-fade where you would otherwise slide or zoom. That is exactly
 *    [MotionLevel.Reduced], which keeps a short fade for visibility changes and drops translation and
 *    scale everywhere else.
 *
 * Collapsing both to "no animation" would make iOS feel broken rather than calm, which is the
 * opposite of what a shopper who enabled that setting asked for.
 *
 * ⚠ Read once at composition, not observed. Both settings are changed in Settings/Preferences, which
 * on both platforms means leaving the app — so the value is re-read when the shopper returns. Wiring
 * a live observer would add a platform listener per app for a case that cannot occur while the app is
 * in front of the user.
 */
@Composable
expect fun platformMotionLevel(): MotionLevel
