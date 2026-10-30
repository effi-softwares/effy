package com.effyshopping.customer.mobile.core.nav

import androidx.navigation3.ui.LocalNavAnimatedContentScope
import com.effyshopping.customer.mobile.core.presentation.LocalEffyNavAnimatedScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.navigation3.runtime.NavEntryDecorator
import androidx.navigation3.runtime.NavKey

/**
 * How the screen currently rendering goes back, or `null` when it is the bottom of its stack.
 *
 * `EffyAppBar` reads this as the default for its `onBack`, so a screen gets a back arrow - or
 * correctly doesn't - **without being told**. Nothing to pass down, nothing to remember.
 */
val LocalNavBack = staticCompositionLocalOf<(() -> Unit)?> { null }

/**
 * Supplies [LocalNavBack] to every destination from its position in the stack, so no screen decides its own
 * back arrow (several once forgot it and stranded the shopper). The same rule as the bottom bar
 * ([CustomerNavState.showBottomBar]):
 *
 *  bottom of a stack → bottom bar, no back arrow
 *  anywhere above it → back arrow, no bottom bar
 *
 * A decorator, evaluated per entry, so a screen sliding off during a pop keeps its arrow all the way out.
 * The order confirmation replaces the stack, so it is the bottom and has no arrow.
 */
@Composable
fun rememberBackAffordanceDecorator(navState: CustomerNavState): NavEntryDecorator<NavKey> =
    remember(navState) {
        NavEntryDecorator { entry ->
            // `NavEntry.key` is private; `contentKey` is the public identity Nav3 itself uses, and for
            // our keys it is `key.toString` (Nav3's `defaultContentKey`). Comparing through the same
            // transformation is what makes this an identity check rather than a string coincidence
            // `CustomerNavKeyContentKeyTest` pins that every route stays distinguishable under it.
            val rootContentKey = navState.currentStack.firstOrNull()?.toString()
            val isStackRoot = entry.contentKey == rootContentKey
            // `pop`'s Boolean says whether it had anywhere to go; a back arrow that exists only
            // because we are above the root always does, so the result is deliberately discarded.
            val back: (() -> Unit)? = if (isStackRoot) null else ({ navState.pop() })
            CompositionLocalProvider(
                LocalNavBack provides back,
                // The navigator's animated scope for this entry, so a picture marked with
                // `effySharedElement` can travel between pages (tile → product).
                LocalEffyNavAnimatedScope provides LocalNavAnimatedContentScope.current,
            ) {
                entry.Content()
            }
        }
    }
