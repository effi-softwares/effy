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
 * The motion level for this subtree. A CompositionLocal rather than an `expect fun`, so the kit
 * declares the contract and each app provides its platform reading at the root; an app providing
 * nothing gets [MotionLevel.Full]. `static`, since it changes at most once per process.
 */
val LocalMotionLevel = staticCompositionLocalOf { MotionLevel.Full }

/** The spec for [role] under the motion level currently in force. */
@Composable
@ReadOnlyComposable
fun rememberMotionSpec(role: MotionRole): EffyMotionSpec =
    EffyMotion.spec(role, LocalMotionLevel.current)
