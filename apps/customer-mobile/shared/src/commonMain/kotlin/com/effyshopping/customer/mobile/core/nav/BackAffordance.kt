package com.effyshopping.customer.mobile.core.nav

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.navigation3.runtime.NavEntryDecorator
import androidx.navigation3.runtime.NavKey

/**
 * How the screen currently rendering goes back, or `null` when it is the bottom of its stack.
 *
 * `EffyAppBar` reads this as the default for its `onBack`, so a screen gets a back arrow — or
 * correctly doesn't — **without being told**. Nothing to pass down, nothing to remember.
 */
val LocalNavBack = staticCompositionLocalOf<(() -> Unit)?> { null }

/**
 * Supplies [LocalNavBack] to every destination, from its position in the stack (026).
 *
 * ── ⚠ The defect this exists to make impossible ─────────────────────────────────────────────────
 *
 * The back arrow used to be an argument each screen decided for itself, and five of them decided
 * wrong: Notifications, FAQs, Help Centre, Customer Service and the order detail rendered a plain
 * heading instead of an app bar, so a shopper who opened one was **stranded** — no arrow, and (since
 * the bottom bar hides below a tab root) no tab bar either. The Cart had an app bar but never passed
 * `onBack`, so its arrow was missing too. Every one of those was a screen author forgetting a
 * parameter, which is exactly what a per-screen argument invites.
 *
 * So the decision moved out of the screens. The rule is one line, and it is the *same* rule that
 * governs the bottom bar (see [CustomerNavState.showBottomBar]):
 *
 *     you are at the bottom of a stack  →  bottom bar, no back arrow
 *     you are anywhere above it         →  back arrow, no bottom bar
 *
 * A new screen is correct by existing. Getting it wrong now requires actively passing `onBack = null`.
 *
 * ── Why a decorator, and not a provider wrapped around NavDisplay ────────────────────────────────
 *
 * Because a decorator is evaluated **per entry**, this asks "is *this* destination the bottom of the
 * stack", not "does the stack currently have depth". The difference shows during the pop animation:
 * wrapped outside `NavDisplay`, popping the last screen flips one shared value the instant the stack
 * shrinks, and the screen still sliding off-screen loses its back arrow mid-flight. Per entry, the
 * departing screen is no longer in the stack at all, so it keeps its arrow all the way out.
 *
 * It also means "terminal" screens need no special case. The order confirmation is reached by
 * *replacing* the stack, so it IS the bottom — no arrow, and no dead arrow that pops nothing.
 */
@Composable
fun rememberBackAffordanceDecorator(navState: CustomerNavState): NavEntryDecorator<NavKey> =
    remember(navState) {
        NavEntryDecorator { entry ->
            // `NavEntry.key` is private; `contentKey` is the public identity Nav3 itself uses, and for
            // our keys it is `key.toString()` (Nav3's `defaultContentKey`). Comparing through the same
            // transformation is what makes this an identity check rather than a string coincidence —
            // `CustomerNavKeyContentKeyTest` pins that every route stays distinguishable under it.
            val rootContentKey = navState.currentStack.firstOrNull()?.toString()
            val isStackRoot = entry.contentKey == rootContentKey
            CompositionLocalProvider(
                LocalNavBack provides if (isStackRoot) null else ({ navState.pop(); Unit }),
            ) {
                entry.Content()
            }
        }
    }
