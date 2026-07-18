package com.effyshopping.mobile.kit

import com.effyshopping.mobile.kit.nav.AppNavKey
import com.effyshopping.shop.mobile.core.nav.AccountRoot
import com.effyshopping.shop.mobile.core.nav.CatalogRoot
import com.effyshopping.shop.mobile.core.nav.HomeRoot
import com.effyshopping.shop.mobile.core.nav.ManagerArea
import com.effyshopping.shop.mobile.core.nav.OrdersRoot
import com.effyshopping.shop.mobile.core.nav.shopNavJson
import kotlinx.serialization.PolymorphicSerializer
import kotlin.test.Test
import kotlin.test.assertEquals

class NavKeySerializationTest {
    private fun roundTrip(route: AppNavKey): AppNavKey {
        val encoded = shopNavJson.encodeToString(PolymorphicSerializer(AppNavKey::class), route)
        return shopNavJson.decodeFromString(PolymorphicSerializer(AppNavKey::class), encoded)
    }

    @Test
    fun every_supported_shop_route_round_trips() {
        listOf(HomeRoot, CatalogRoot, OrdersRoot, AccountRoot, ManagerArea).forEach { route ->
            assertEquals(route, roundTrip(route))
        }
    }
}
