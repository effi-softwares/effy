package com.effyshopping.customer.mobile.core.nav

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * A unidirectional navigator whose state IS the back stack (013 D18 rationale, realised without the
 * Nav3 dependency's bleeding-edge API). The stack is a `List<AppRoute>` the app owns, so the
 * auth-graph ↔ protected-graph swap is a list rewrite ([resetTo]) rather than `popUpTo` gymnastics —
 * which is exactly the property that avoids the "Back returns to the sign-in screen" bug.
 *
 * (Migrating to Compose Navigation 3 later is a presentation-layer change: the routes are already
 * `@Serializable`-ready sealed types, and nothing outside `presentation/` depends on this class.)
 */
class AppNavigator(start: AppRoute = AppRoute.Home) {
    private val _stack = MutableStateFlow(listOf(start))
    val stack: StateFlow<List<AppRoute>> = _stack.asStateFlow()

    val current: AppRoute get() = _stack.value.last()
    val canGoBack: Boolean get() = _stack.value.size > 1

    fun push(route: AppRoute) {
        _stack.value = _stack.value + route
    }

    /** Pop the top. Returns false if already at the root (nothing to pop) — the caller may exit. */
    fun pop(): Boolean {
        if (_stack.value.size <= 1) return false
        _stack.value = _stack.value.dropLast(1)
        return true
    }

    /** Pop back to [route] if present; otherwise push it. Used to return to a deferred destination. */
    fun popTo(route: AppRoute) {
        val idx = _stack.value.indexOfLast { it == route }
        _stack.value = if (idx >= 0) _stack.value.subList(0, idx + 1) else _stack.value + route
    }

    /** Replace the WHOLE stack — the graph swap (e.g. on sign-in, or back to guest on sign-out). */
    fun resetTo(route: AppRoute) {
        _stack.value = listOf(route)
    }
}
