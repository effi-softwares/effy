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

// Pushed within the Today tab (049 US1/US2).
@Serializable
data class CollectionRunRoute(val runId: String) : AppNavKey

@Serializable
data class ShopStopRoute(val runId: String, val stopId: String) : AppNavKey

@Serializable
data class HubCheckinRoute(val runId: String) : AppNavKey

@Serializable
data class DeliveryRunRoute(val runId: String) : AppNavKey

@Serializable
data class DropRoute(val runId: String, val dropId: String) : AppNavKey

// Pushed within the History tab (049 US5).
@Serializable
data class HistoryDetailRoute(val kind: String, val id: String, val title: String) : AppNavKey

// The in-app activity feed, pushed within the Today tab (049 US6).
@Serializable
data object ActivityRoute : AppNavKey

// ── 060: four destinations the design has and the app did not ──────────────────────────────────

/**
 * Report a missing or short package at a shop stop (design screen `shop-problem`, FR-021).
 *
 * ⚠ Before 060 this was a bare `TextButton` that fired `onReport("missing")` on tap — the driver
 * could not say WHICH package or WHAT was wrong, and the report went with no note.
 */
@Serializable
data class ShopProblemRoute(val runId: String, val stopId: String) : AppNavKey

/** Light / dark / follow-system as its own screen (design screen `appearance`). */
@Serializable
data object AppearanceRoute : AppNavKey

/**
 * Help & support (design screen `help`).
 *
 * ⚠ The app had no help screen at all, so a driver who needed dispatch had nowhere in the app to
 * find them.
 */
@Serializable
data object HelpRoute : AppNavKey

/** Recovery when a permission the app needs was refused (design screen `perm-denied`). */
@Serializable
data object PermissionDeniedRoute : AppNavKey

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
        subclass(CollectionRunRoute::class, CollectionRunRoute.serializer())
        subclass(ShopStopRoute::class, ShopStopRoute.serializer())
        subclass(HubCheckinRoute::class, HubCheckinRoute.serializer())
        subclass(DeliveryRunRoute::class, DeliveryRunRoute.serializer())
        subclass(DropRoute::class, DropRoute.serializer())
        subclass(HistoryDetailRoute::class, HistoryDetailRoute.serializer())
        subclass(ActivityRoute::class, ActivityRoute.serializer())
        // ⚠ 060 — a route absent from here is NOT a compile error. It fails at runtime, only after
        // process death, only on that tab. RouteSerializerGuardTest makes the omission a test failure.
        subclass(ShopProblemRoute::class, ShopProblemRoute.serializer())
        subclass(AppearanceRoute::class, AppearanceRoute.serializer())
        subclass(HelpRoute::class, HelpRoute.serializer())
        subclass(PermissionDeniedRoute::class, PermissionDeniedRoute.serializer())
    }
}
