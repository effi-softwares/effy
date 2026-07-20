package com.effyshopping.shop.mobile.core.nav

import com.effyshopping.mobile.kit.nav.AppNavKey
import com.effyshopping.mobile.kit.nav.navKeySerializersModule
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.modules.subclass

/**
 * The shop app's navigation routes (015). Every route is a `@Serializable` [AppNavKey] so the per-tab back
 * stacks round-trip across configuration change and iOS process death (research R6). Replaces the interim
 * `AppRoute` + `AppNavigator` (014) with the shared [com.effyshopping.mobile.kit.nav.TabBackStacks] shell.
 */
@Serializable
data object HomeRoot : AppNavKey

@Serializable
data object CatalogRoot : AppNavKey

@Serializable
data object OrdersRoot : AppNavKey

@Serializable
data object AccountRoot : AppNavKey

/** Manager-gated destination, pushed within the Home tab — proves the backend gate (014 carried forward). */
@Serializable
data object ManagerArea : AppNavKey

/**
 * One fulfillment portion, pushed within the Orders tab (020 US2). Carries the portion id so a compact-width
 * pick survives configuration change AND iOS process death — the operator's tablet can be locked mid-pick and
 * reopen on the same order. Wide layouts show the queue and this pane side by side and never push it.
 */
@Serializable
data class OrderDetail(val id: String) : AppNavKey

/**
 * The shop app's primary tabs. The whole shell is gated (login-first, FR-014/015), so every tab is
 * authenticated. Catalog/Orders are "coming soon" until their feature slices land.
 */
enum class ShopTab(val label: String, val start: AppNavKey) {
    HOME("Home", HomeRoot),
    CATALOG("Catalog", CatalogRoot),
    ORDERS("Orders", OrdersRoot),
    ACCOUNT("Account", AccountRoot),
}

fun shopStartRoute(tab: ShopTab): AppNavKey = tab.start

/** JSON configured with the shop route module — backs the saveable per-tab back stacks (R6). */
val shopNavJson: Json = Json {
    ignoreUnknownKeys = true
    serializersModule = navKeySerializersModule {
        subclass(HomeRoot::class, HomeRoot.serializer())
        subclass(CatalogRoot::class, CatalogRoot.serializer())
        subclass(OrdersRoot::class, OrdersRoot.serializer())
        subclass(AccountRoot::class, AccountRoot.serializer())
        subclass(ManagerArea::class, ManagerArea.serializer())
        // Every route MUST be registered here: an unregistered subclass fails state restore SILENTLY on iOS
        // (the back stack decodes to nothing rather than throwing), which looks like "the app forgot".
        subclass(OrderDetail::class, OrderDetail.serializer())
    }
}
