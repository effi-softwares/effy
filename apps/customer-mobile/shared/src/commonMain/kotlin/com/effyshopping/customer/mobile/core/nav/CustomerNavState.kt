package com.effyshopping.customer.mobile.core.nav

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.navigation3.runtime.NavBackStack
import androidx.navigation3.runtime.NavKey
import androidx.navigation3.runtime.rememberNavBackStack

/**
 * The customer app's navigation state: one back stack per tab, plus the active tab (the Navigation 3
 * `multiplestacks` recipe). Switching tabs swaps which stack `NavDisplay` renders; the others keep their
 * contents.
 */
class CustomerNavState internal constructor(
    private val stacks: Map<CustomerNavKey, NavBackStack<NavKey>>,
    activeTabState: androidx.compose.runtime.MutableState<CustomerNavKey>,
) {
    /** The tab whose stack is currently displayed. */
    var activeTab: CustomerNavKey by activeTabState
        private set

    /** The active tab's stack. Nav3 owns this list; the UI observes it directly. */
    val currentStack: NavBackStack<NavKey> get() = stacks.getValue(activeTab)

    /** The destination on screen right now. */
    val current: CustomerNavKey get() = currentStack.last() as CustomerNavKey

    /** The bottom bar shows only at a tab's root, falling out of the per-tab stack with no per-screen flag. */
    val showBottomBar: Boolean get() = currentStack.size == 1

    /** True when the active tab has somewhere to go back to. */
    val canGoBack: Boolean get() = currentStack.size > 1

    fun selectTab(tab: CustomerNavKey) {
        require(tab in stacks) { "$tab is not a tab root" }
        activeTab = tab
    }

    /**
     * A tap on a tab in the bar. Another tab: switch to it, where the shopper left it. The tab
     * they are already in: return it to its root — the iOS convention, and the only way back to the
     * top of a tab after going several pages deep without pressing Back repeatedly.
     */
    fun tapTab(tab: CustomerNavKey) {
        if (tab == activeTab) resetToRoot() else selectTab(tab)
    }

    // The search-focus one-shot

    private var searchFocusRequested = false

    /**
     * Ask the Search screen to open with its field focused and the keyboard up.
     *
     * Set by Home's search entry immediately before `selectTab(Search)`, so one tap reaches a live
     * keyboard.
     *
     * Why a flag and not a parameter on the route
     *
     * The obvious move is `data class Search(val focus: Boolean)`. It is a trap: tab roots are used
     * as map keys in [stacks], so the tab's identity IS the key. `Search(focus = true)` is a
     * different key from `Search(focus = false)`, and `stacks.getValue(activeTab)` throws the moment
     * the flag is set. Re-keying the map on a separate tab identity is churn in the one file whose
     * own header documents a permanent wrong-tab bug — not worth it for a transient signal.
     *
     * Deliberately not saved across process death. A restored app should show the shopper their
     * results, not reopen the keyboard on top of them.
     */
    fun requestSearchFocus() {
        searchFocusRequested = true
    }

    /**
     * Take the pending focus request, if any. Returns `true` at most once per [requestSearchFocus].
     *
     * The one-shot is what stops the keyboard reappearing every time Search recomposes — and, more
     * visibly, every time the shopper returns to the Search tab from the bottom bar having never
     * asked for it.
     */
    fun consumeSearchFocus(): Boolean {
        val requested = searchFocusRequested
        searchFocusRequested = false
        return requested
    }

    fun push(key: CustomerNavKey) {
        currentStack.add(key)
    }

    /**
     * Pop within the active tab.
     *
     * Returns false at a tab root, so the caller decides what "back" means there — this app returns
     * to Home rather than exiting, and only exits from Home.
     */
    fun pop(): Boolean {
        if (currentStack.size <= 1) return false
        currentStack.removeAt(currentStack.lastIndex)
        return true
    }

    /**
     * Send the active tab back to its own root — the graph swap (sign-in completing, sign-out
     * returning to guest, an order finishing).
     *
     * Use this, not `resetTo(SomeTabRoot)`
     *
     * This exists because the Nav3 migration got it wrong in a way nothing caught. The old navigator
     * used `AppRoute.Home` to mean **"the root of whichever sub-graph you are in"** — inside the
     * account tab it rendered the account screen. The migration renamed it to `CustomerNavKey.Home`,
     * which means the **Discover tab**. Same name, opposite meaning.
     *
     * So `completeSignIn` ran `resetTo(Home)` while the customer was in the Account tab, and set the
     * account tab's stack to `[Home]`. From then on, tapping Account showed Discover — permanently,
     * because nothing ever put `Account` back. Signing in broke the account page.
     *
     * Resetting to "the active tab's root" is what every one of those callers actually meant, and it
     * cannot name the wrong tab because it does not name a tab at all.
     */
    fun resetToRoot() {
        currentStack.clear()
        currentStack.add(activeTab)
    }

    /**
     * Replace the active tab's stack with one destination (one tab only: signing in should not wipe a cart
     * journey in Home). [key] must not be another tab's root (see [resetToRoot]); that fails loudly.
     */
    fun resetTo(key: CustomerNavKey) {
        require(key !in CUSTOMER_TAB_ROOTS || key == activeTab) {
            "resetTo($key) would make $key the root of the $activeTab tab — tapping $activeTab would " +
                "then show $key. Use resetToRoot() to return a tab to its own root."
        }
        currentStack.clear()
        currentStack.add(key)
    }

}

/**
 * Create the per-tab back stacks, restored across configuration change and process death.
 *
 * Uses the [customerNavSavedState] overload of `rememberNavBackStack`, not the reflection-based
 * one. The convenient overload works on Android and throws on iOS, so using it would produce a
 * restore bug that no Android test could catch.
 */
@Composable
fun rememberCustomerNavState(): CustomerNavState {
    val stacks = CUSTOMER_TAB_ROOTS.associateWith { root ->
        rememberNavBackStack(customerNavSavedState, root)
    }
    val activeTab = remember { mutableStateOf<CustomerNavKey>(CustomerNavKey.Home) }
    return remember(stacks) { CustomerNavState(stacks, activeTab) }
}

/**
 * The handle ViewModels navigate through (`AuthViewModel` resets to the account screen after sign-in).
 * Nav3's composable owns the stack; this late-bound handle holds none of its own and forwards to
 * [CustomerNavState]. Before the shell binds it, calls are no-ops (previews, tests).
 */
class CustomerNavigator {
    private var state: CustomerNavState? = null

    fun bindTo(state: CustomerNavState) {
        this.state = state
    }

    fun push(key: CustomerNavKey) {
        state?.push(key)
    }

    fun pop(): Boolean = state?.pop() ?: false

    fun resetTo(key: CustomerNavKey) {
        state?.resetTo(key)
    }

    /** Send the active tab back to its own root — see [CustomerNavState.resetToRoot]. */
    fun resetToRoot() {
        state?.resetToRoot()
    }

    fun selectTab(tab: CustomerNavKey) {
        state?.selectTab(tab)
    }

    /** Ask Search to open focused — see [CustomerNavState.requestSearchFocus]. */
    fun requestSearchFocus() {
        state?.requestSearchFocus()
    }

}
