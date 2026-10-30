package com.effyshopping.driver.mobile.core.nav

import com.effyshopping.mobile.kit.nav.AppNavKey
import com.effyshopping.mobile.kit.nav.navKeySerializersModule
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.modules.subclass

/**
 * The driver app's navigation routes. Every route is a `@Serializable` [AppNavKey] so the per-tab
 * back stacks round-trip across configuration change and iOS process death. Login-first: the whole shell
 * is gated, so every tab is authenticated.
 */
@Serializable
data object TodayRoot : AppNavKey

@Serializable
data object HistoryRoot : AppNavKey

@Serializable
data object AccountRoot : AppNavKey

// Pushed within the Today tab.
@Serializable
data class CollectionRunRoute(val runId: String) : AppNavKey

@Serializable
data class ShopStopRoute(val runId: String, val stopId: String, val scan: Boolean = false) : AppNavKey

@Serializable
data class HubCheckinRoute(val runId: String) : AppNavKey

@Serializable
data class DeliveryRunRoute(val runId: String) : AppNavKey

@Serializable
data class DropRoute(val runId: String, val dropId: String, val scan: Boolean = false) : AppNavKey

// Pushed within the History tab.
@Serializable
data class HistoryDetailRoute(val kind: String, val id: String, val title: String) : AppNavKey

// Four destinations the design has and the app did not

/**
 * Help & support (design screen `help`).
 *
 * The app had no help screen at all, so a driver who needed dispatch had nowhere in the app to
 * find them.
 */
@Serializable
data object HelpRoute : AppNavKey

/** Rev 2 - the parcels from failed drops, coming back to the hub (redesign `11 Return parcels`). */
@Serializable
data class ReturnHubRoute(val runId: String, val scan: Boolean = false) : AppNavKey

/** Recovery when a permission the app needs was refused (design screen `perm-denied`). */
@Serializable
data object PermissionDeniedRoute : AppNavKey

/**
 * The driver app's three tabs: Today (the phase-aware home and every run, stop and drop pushed
 * from it), History, Account. Map and Activity were removed - the map was a schematic with no
 * cartography, and the round's changes are said on Today.
 */
enum class DriverTab(val label: String, val start: AppNavKey) {
    TODAY("Today", TodayRoot),
    HISTORY("History", HistoryRoot),
    ACCOUNT("Account", AccountRoot),
}

fun driverStartRoute(tab: DriverTab): AppNavKey = tab.start

/** JSON configured with the driver route module - backs the saveable per-tab back stacks. */
val driverNavJson: Json = Json {
    ignoreUnknownKeys = true
    serializersModule = navKeySerializersModule {
        subclass(TodayRoot::class, TodayRoot.serializer())
        subclass(HistoryRoot::class, HistoryRoot.serializer())
        subclass(AccountRoot::class, AccountRoot.serializer())
        subclass(CollectionRunRoute::class, CollectionRunRoute.serializer())
        subclass(ShopStopRoute::class, ShopStopRoute.serializer())
        subclass(HubCheckinRoute::class, HubCheckinRoute.serializer())
        subclass(DeliveryRunRoute::class, DeliveryRunRoute.serializer())
        subclass(DropRoute::class, DropRoute.serializer())
        subclass(HistoryDetailRoute::class, HistoryDetailRoute.serializer())
        // A route absent from here is not a compile error. It fails at runtime, only after
        // process death, only on that tab. RouteSerializerGuardTest makes the omission a test failure.
        subclass(HelpRoute::class, HelpRoute.serializer())
        subclass(ReturnHubRoute::class, ReturnHubRoute.serializer())
        subclass(PermissionDeniedRoute::class, PermissionDeniedRoute.serializer())
    }
}
