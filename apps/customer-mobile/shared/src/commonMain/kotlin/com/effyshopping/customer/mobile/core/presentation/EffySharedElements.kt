package com.effyshopping.customer.mobile.core.presentation

import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Modifier

/**
 * Shared-element plumbing for "the product picture grows from its tile into the product page". The shell
 * wraps the navigator in a `SharedTransitionLayout` and provides its scope here; each destination provides
 * the animated-content scope; a picture with the same key on both pages travels between them. Outside the
 * shell (previews, tests) and under reduced motion, the modifier does nothing.
 */
@OptIn(ExperimentalSharedTransitionApi::class)
val LocalEffySharedTransition = compositionLocalOf<SharedTransitionScope?> { null }

/** The navigator's animated-content scope for the destination being drawn. */
val LocalEffyNavAnimatedScope = compositionLocalOf<AnimatedVisibilityScope?> { null }

/** Mark this element as the shared element [key] (no-op without the shell or under reduced motion). */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun Modifier.effySharedElement(key: String): Modifier {
    val shared = LocalEffySharedTransition.current ?: return this
    val animated = LocalEffyNavAnimatedScope.current ?: return this
    if (!effyMotionFull()) return this
    return with(shared) {
        this@effySharedElement.sharedElement(rememberSharedContentState(key), animatedVisibilityScope = animated)
    }
}
