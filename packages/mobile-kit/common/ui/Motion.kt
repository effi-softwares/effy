package com.effyshopping.mobile.kit.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf

enum class MotionLevel { None, Reduced, Full }

enum class MotionRole { Press, Selection, PeerDestination, Forward, Back, RootState, Visibility }

data class EffyMotionSpec(
    val durationMillis: Int,
    val usesTranslation: Boolean,
    val usesScale: Boolean,
)

object EffyMotion {
    const val FastMillis = 100
    const val StandardMillis = 180
    const val EmphasizedMillis = 220

    fun spec(role: MotionRole, level: MotionLevel): EffyMotionSpec = when (level) {
        MotionLevel.None -> EffyMotionSpec(0, usesTranslation = false, usesScale = false)
        MotionLevel.Reduced -> EffyMotionSpec(
            durationMillis = if (role == MotionRole.Visibility || role == MotionRole.RootState) FastMillis else 0,
            usesTranslation = false,
            usesScale = false,
        )
        MotionLevel.Full -> when (role) {
            MotionRole.Press, MotionRole.Selection -> EffyMotionSpec(FastMillis, false, true)
            MotionRole.PeerDestination -> EffyMotionSpec(StandardMillis, false, false)
            MotionRole.Forward, MotionRole.Back -> EffyMotionSpec(EmphasizedMillis, true, false)
            MotionRole.RootState, MotionRole.Visibility -> EffyMotionSpec(StandardMillis, false, false)
        }
    }
}

/**
 * The motion level in force for this subtree (025 FR-037 / T073).
 *
 * ── Why a CompositionLocal and not an `expect fun` ──────────────────────────────────────────────
 *
 * Reading the device's reduced-motion setting needs platform code, and the obvious shape for that is
 * `expect fun`. ⚠ It does not work here: `packages/mobile-kit` is `srcDir`'d into the `commonMain`
 * of BOTH customer-mobile and shop-mobile, so an `expect` declared here compels every consuming app
 * to supply an `actual` — which would break `shop-mobile`'s build until someone added a file to a
 * SIGNED-OFF surface for a feature it does not yet use.
 *
 * A CompositionLocal inverts that: the kit declares the contract, each app opts in by providing its
 * platform reading at the root, and an app that provides nothing gets [MotionLevel.Full] — today's
 * behaviour, unchanged. Adding this cost shop-mobile exactly zero lines.
 *
 * `static` rather than plain: the value changes at most once per process (an OS accessibility
 * setting), so invalidating the whole subtree on change is cheaper than tracking every read.
 */
val LocalMotionLevel = staticCompositionLocalOf { MotionLevel.Full }

/** The spec for [role] under the motion level currently in force. */
@Composable
@ReadOnlyComposable
fun rememberMotionSpec(role: MotionRole): EffyMotionSpec =
    EffyMotion.spec(role, LocalMotionLevel.current)
