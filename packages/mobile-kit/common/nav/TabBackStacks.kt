package com.effyshopping.mobile.kit.nav

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import kotlinx.serialization.Polymorphic
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Per-tab back stacks: each tab keeps its own history, back pops only the current tab, and re-selecting
 * the active tab pops it to root. A dependency-free holder on Compose snapshot state; routes are
 * serializable keys, so a move to Nav3 is a presentation-layer change. [rememberTabBackStacks] keeps it
 * across configuration change and process death.
 */
class TabBackStacks<T : Any> internal constructor(
    val tabs: List<T>,
    initialTab: T,
    private val startRoute: (T) -> AppNavKey,
    initialStacks: Map<T, List<AppNavKey>>,
) {
    var currentTab: T by mutableStateOf(initialTab)
        private set

    private val stacks = mutableStateMapOf<T, List<AppNavKey>>().apply { putAll(initialStacks) }

    val currentStack: List<AppNavKey> get() = stacks[currentTab] ?: listOf(startRoute(currentTab))
    val currentRoute: AppNavKey get() = currentStack.last()
    val canGoBack: Boolean get() = currentStack.size > 1

    /** Switch to [tab]; re-selecting the already-current tab pops it back to its root. */
    fun selectTab(tab: T) {
        if (tab == currentTab) {
            stacks[tab] = listOf(startRoute(tab))
        } else {
            currentTab = tab
        }
    }

    /** Push a route onto the current tab's stack. */
    fun push(route: AppNavKey) {
        stacks[currentTab] = currentStack + route
    }

    /** Pop the current tab's stack; false when already at that tab's root (caller may switch tab / exit). */
    fun pop(): Boolean {
        val s = currentStack
        if (s.size <= 1) return false
        stacks[currentTab] = s.dropLast(1)
        return true
    }

    /** Clears every tab to its root and returns to [homeTab] (sign-out), so no route survives. */
    fun resetForSignOut(homeTab: T) {
        tabs.forEach { stacks[it] = listOf(startRoute(it)) }
        currentTab = homeTab
    }

    internal fun stacksSnapshot(): Map<T, List<AppNavKey>> =
        tabs.associateWith { stacks[it] ?: listOf(startRoute(it)) }
}

@Serializable
private data class SavedTabStacks(
    val currentTab: String,
    val stacks: Map<String, List<@Polymorphic AppNavKey>>,
)

/**
 * Remembers a [TabBackStacks] across configuration change and process death, serialized through [json],
 * which must carry the app's `navKeySerializersModule`.
 *
 * @param tabId a stable string id for a tab (e.g. `enum.name`); [tabById] is its inverse.
 */
@Composable
fun <T : Any> rememberTabBackStacks(
    tabs: List<T>,
    initialTab: T,
    tabId: (T) -> String,
    tabById: (String) -> T,
    startRoute: (T) -> AppNavKey,
    json: Json,
): TabBackStacks<T> {
    val saver = Saver<TabBackStacks<T>, String>(
        save = { tbs ->
            val payload = SavedTabStacks(
                currentTab = tabId(tbs.currentTab),
                stacks = tbs.stacksSnapshot().entries.associate { (tab, stack) -> tabId(tab) to stack },
            )
            json.encodeToString(SavedTabStacks.serializer(), payload)
        },
        restore = { saved ->
            val payload = json.decodeFromString(SavedTabStacks.serializer(), saved)
            TabBackStacks(
                tabs = tabs,
                initialTab = tabById(payload.currentTab),
                startRoute = startRoute,
                initialStacks = payload.stacks.entries.associate { (id, stack) -> tabById(id) to stack },
            )
        },
    )
    return rememberSaveable(saver = saver) {
        TabBackStacks(tabs, initialTab, startRoute, tabs.associateWith { listOf(startRoute(it)) })
    }
}
