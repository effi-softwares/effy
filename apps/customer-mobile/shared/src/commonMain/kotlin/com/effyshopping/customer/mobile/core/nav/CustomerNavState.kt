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
 * The customer app's navigation state — **one back stack per tab**, plus which tab is active (026).
 *
 * This is the pattern the official Navigation 3 `multiplestacks` recipe uses: a `Map` of back stacks
 * keyed by the tab root, and a `MutableState` for the active tab. Switching tabs swaps which stack
 * `NavDisplay` renders; the other four keep their contents and their state, which is the whole point.
 *
 * ── What this replaced, and why it matters ──────────────────────────────────────────────────────
 *
 * 015 kept the Home tab's stack as a delimiter-joined **String** — `"homeproduct:42"` — parsed
 * with `startsWith("product:")` and `removePrefix(...)`. Orders kept its detail in a separate nullable
 * `String` id, and the Account tab used a third mechanism (`AppNavigator`). Three tabs, three
 * different notions of "where am I", and a typo in any prefix produced a blank screen at runtime
 * rather than a compile error.
 *
 * Now every tab has the same kind of stack, holding the same typed keys.
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

    /**
     * The bottom bar shows only at a tab's ROOT.
     *
     * That is the whole rule: the bar exists to move between the four tabs, and once you have gone
     * deeper into one, Back and the app bar are what you need. It falls straight out of the per-tab
     * stack — no per-destination flag to keep in step, and a new screen gets the right behaviour by
     * existing rather than by remembering to declare something.
     *
     * It also fixes the defect that prompted this: product detail, cart and checkout each render a
     * sticky full-width primary action, and the nav bar was stacking underneath it.
     */
    val showBottomBar: Boolean get() = currentStack.size == 1

    /** True when the active tab has somewhere to go back to. */
    val canGoBack: Boolean get() = currentStack.size > 1

    fun selectTab(tab: CustomerNavKey) {
        require(tab in stacks) { "$tab is not a tab root" }
        activeTab = tab
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
     * Send the active tab back to its OWN root — the graph swap (sign-in completing, sign-out
     * returning to guest, an order finishing).
     *
     * ── ⚠ Use this, not `resetTo(SomeTabRoot)` ──────────────────────────────────────────────────
     *
     * This exists because the Nav3 migration got it wrong in a way nothing caught. The old navigator
     * used `AppRoute.Home` to mean **"the root of whichever sub-graph you are in"** — inside the
     * Account tab it rendered the account screen. The migration renamed it to `CustomerNavKey.Home`,
     * which means the **Discover tab**. Same name, opposite meaning.
     *
     * So `completeSignIn` ran `resetTo(Home)` while the customer was in the Account tab, and set the
     * ACCOUNT tab's stack to `[Home]`. From then on, tapping Account showed Discover — permanently,
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
     * Replace the ACTIVE TAB's stack with one destination.
     *
     * Deliberately scoped to one tab: wiping every tab's history because the customer signed in would
     * throw away a half-built cart journey in Home for no reason.
     *
     * ⚠ [key] MUST NOT be another tab's root — that is the defect described on [resetToRoot], and it
     * is a programming error rather than anything a customer can cause, so it fails loudly here
     * instead of silently rendering the wrong tab forever.
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
 * ⚠ Uses the [customerNavSavedState] overload of `rememberNavBackStack`, NOT the reflection-based
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
 * The handle ViewModels navigate through.
 *
 * ── ⚠ Why this exists at all ────────────────────────────────────────────────────────────────────
 *
 * Nav3's model is that the **composable owns the back stack**. This app's ViewModels, however, drive
 * navigation directly (`AuthViewModel` resets to the account screen once sign-in completes), and
 * 026 FR-025b forbids disturbing ViewModel wiring while replacing presentation.
 *
 * So the stack stays owned by the composable and this is a thin, late-bound handle onto it. It is NOT
 * a second source of truth: it holds no stack of its own and every call forwards to [CustomerNavState].
 * Before the shell binds it, calls are no-ops rather than crashes — a ViewModel constructed during a
 * preview or a test has nothing to navigate, and that should not be fatal.
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

}
