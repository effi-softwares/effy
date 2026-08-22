package com.effyshopping.driver.mobile.core.nav

import com.effyshopping.mobile.kit.nav.AppNavKey
import com.effyshopping.mobile.kit.nav.navKeySerializersModule
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.modules.subclass

/**
 * The driver app's navigation routes (049). Every route is a `@Serializable` [AppNavKey] so the per-tab
 * back stacks round-trip across configuration change and iOS process death. Login-first: the whole shell
 * is gated, so every tab is authenticated.
 */
@Serializable
data object TodayRoot : AppNavKey

@Serializable
data object MapRoot : AppNavKey

@Serializable
data object HistoryRoot : AppNavKey

@Serializable
data object AccountRoot : AppNavKey

/**
 * The driver app's primary tabs (spec §4 IA). Today is the phase-aware home (collection run / same-day
 * run). Map/History are their own feature slices (US4/US5) — placeholders in this foundation.
 */
enum class DriverTab(val label: String, val start: AppNavKey) {
    TODAY("Today", TodayRoot),
    MAP("Map", MapRoot),
    HISTORY("History", HistoryRoot),
    ACCOUNT("Account", AccountRoot),
}

fun driverStartRoute(tab: DriverTab): AppNavKey = tab.start

/** JSON configured with the driver route module — backs the saveable per-tab back stacks. */
val driverNavJson: Json = Json {
    ignoreUnknownKeys = true
    serializersModule = navKeySerializersModule {
        subclass(TodayRoot::class, TodayRoot.serializer())
        subclass(MapRoot::class, MapRoot.serializer())
        subclass(HistoryRoot::class, HistoryRoot.serializer())
        subclass(AccountRoot::class, AccountRoot.serializer())
    }
}
