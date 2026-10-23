package com.effyshopping.customer.mobile.core.presentation

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.TextStyle
import com.effyshopping.mobile.kit.ui.LocalMotionLevel
import com.effyshopping.mobile.kit.ui.MotionLevel

/**
 * Motion for the customer app (the canvas's Motion and Page transitions boards). The storefront's timings,
 * separate from `packages/mobile-kit`'s `EffyMotion`. They read [LocalMotionLevel]:
 * Full → the spec · Reduced → a short fade, no movement · None → instant.
 *
 * Where each animation lives:
 *  - push / pop slide and predictive pop............ app/CustomerShell.kt (transitionSpec family)
 *  - tab bar show / hide............................ app/CustomerShell.kt + mobile-kit ResponsiveNavigation
 *  - primary-button press (0.98).................... EffyButtons.kt EffyPrimaryButton → effyPress
 *  - product-card press (0.97)...................... ProductTile.kt EffyProductCard → effyPress
 *  - skeleton shimmer 1100ms........................ EffyStates.kt effyShimmer
 *  - pull-to-refresh content translation............ mobile-kit EffyPullToRefresh
 *  - OTP caret blink................................ mobile-kit OtpCells
 *  - onboarding pager + indicator width............. features/onboarding/OnboardingScreen.kt
 *  - FAQ expand..................................... features/help/HelpScreens.kt
 *  - banner carousel / product gallery pagers....... HomeBlocks.kt, ProductDetailScreen.kt
 */
object EffyStorefrontMotion {
    const val PressMillis = 100
    const val StandardMillis = 200
    const val EmphasisedMillis = 300
    const val PushMillis = 350
    const val TabFadeMillis = 150
    const val ReducedFadeMillis = 150
    const val ShimmerMillis = 1100
    const val MorphMillis = 250

    /** The iOS navigation curve — a quick start that settles softly. */
    val IosEase = CubicBezierEasing(0.32f, 0.72f, 0f, 1f)

    /** A sheet's spring: settles without a visible bounce. */
    val SheetDamping = 0.86f
    const val SheetStiffness = 380f
}

/** Is full motion allowed? (Reduced and None both mean "no movement".) */
@Composable
fun effyMotionFull(): Boolean = LocalMotionLevel.current == MotionLevel.Full

/** The duration to use for a state change: [full] when allowed, a short fade when reduced, 0 when none. */
@Composable
fun effyDuration(full: Int): Int = when (LocalMotionLevel.current) {
    MotionLevel.Full -> full
    MotionLevel.Reduced -> EffyStorefrontMotion.ReducedFadeMillis
    MotionLevel.None -> 0
}

/**
 * Press feedback: the element sinks slightly while held. Tiles 0.97, buttons 0.98 (Motion board).
 * Off under reduced motion — the tap still works, only the movement goes.
 */
@Composable
fun Modifier.effyPress(interactions: InteractionSource, pressedScale: Float = 0.98f): Modifier {
    val pressed by interactions.collectIsPressedAsState()
    val full = effyMotionFull()
    val scale by animateFloatAsState(
        targetValue = if (pressed && full) pressedScale else 1f,
        animationSpec = tween(EffyStorefrontMotion.PressMillis),
        label = "effyPress",
    )
    return this.graphicsLayer { scaleX = scale; scaleY = scale }
}

/**
 * A bump: scale 1 → 1.25 → 1 on a spring whenever [trigger] changes (not on first composition) — the
 * cart badge when something is added. Off under reduced motion.
 */
@Composable
fun Modifier.effyBump(trigger: Any?): Modifier {
    val scale = remember { Animatable(1f) }
    val full = effyMotionFull()
    val first = remember { booleanArrayOf(true) }
    LaunchedEffect(trigger) {
        if (first[0]) { first[0] = false; return@LaunchedEffect }
        if (!full) return@LaunchedEffect
        scale.animateTo(1.25f, tween(120))
        scale.animateTo(1f, spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMedium))
    }
    return this.graphicsLayer { scaleX = scale.value; scaleY = scale.value }
}

/**
 * A number that rolls: the new value slides up into place (down when it decreased). Totals,
 * quantities and counts (Motion board "number roll"). Reduced motion → a fade; none → instant.
 */
@Composable
fun EffyNumberRoll(
    text: String,
    modifier: Modifier = Modifier,
    style: TextStyle = LocalTextStyle.current,
    color: Color = Color.Unspecified,
) {
    val full = effyMotionFull()
    val duration = effyDuration(EffyStorefrontMotion.StandardMillis)
    AnimatedContent(
        targetState = text,
        modifier = modifier,
        transitionSpec = {
            val up = (targetState.filter { it.isDigit() }.toLongOrNull() ?: 0L) >=
                (initialState.filter { it.isDigit() }.toLongOrNull() ?: 0L)
            if (full) {
                (slideInVertically(tween(duration)) { if (up) it else -it } + fadeIn(tween(duration))) togetherWith
                    (slideOutVertically(tween(duration)) { if (up) -it else it } + fadeOut(tween(duration)))
            } else {
                fadeIn(tween(duration)) togetherWith fadeOut(tween(duration))
            }
        },
        label = "numberRoll",
    ) { value -> Text(value, style = style, color = color) }
}

/** Haptics: a light tick for a quantity change, a confirm for a placed order. */
object EffyHaptics {
    @Composable
    fun tick(): () -> Unit {
        val haptics = LocalHapticFeedback.current
        return { haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove) }
    }

    @Composable
    fun success(): () -> Unit {
        val haptics = LocalHapticFeedback.current
        return { haptics.performHapticFeedback(HapticFeedbackType.Confirm) }
    }
}
