package com.effyshopping.customer.mobile.core.presentation

import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Modifier

/**
 * Shared-element plumbing for "the product picture grows from its tile into the product page"
 * (Page transitions board; 087 FR-017).
 *
 * The shell wraps the navigator in a `SharedTransitionLayout` and provides its scope here; each
 * destination provides the navigator's animated-content scope. A picture marked with the same key on
 * both pages then travels between them. Outside the shell (previews, tests) both are null and the
 * modifier does nothing — as it does under reduced motion, where the push falls back to a fade.
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
