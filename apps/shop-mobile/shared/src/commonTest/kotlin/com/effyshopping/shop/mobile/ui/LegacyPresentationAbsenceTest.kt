package com.effyshopping.shop.mobile.ui

import com.effyshopping.mobile.kit.nav.AppNavKey
import com.effyshopping.shop.mobile.core.nav.AccountRoot
import com.effyshopping.shop.mobile.core.nav.CatalogRoot
import com.effyshopping.shop.mobile.core.nav.HomeRoot
import com.effyshopping.shop.mobile.core.nav.ManagerArea
import com.effyshopping.shop.mobile.core.nav.OrdersRoot
import com.effyshopping.shop.mobile.core.nav.shopNavJson
import kotlinx.serialization.PolymorphicSerializer
import kotlinx.serialization.SerializationException
import kotlin.test.Test
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse

class LegacyPresentationAbsenceTest {
    @Test
    fun supported_routes_contain_no_product_detail_or_create_destination() {
        val encoded = listOf(HomeRoot, CatalogRoot, OrdersRoot, AccountRoot, ManagerArea).map { route ->
            shopNavJson.encodeToString(PolymorphicSerializer(AppNavKey::class), route)
        }.joinToString()
        assertFalse(encoded.contains("CatalogProductRoute"))
        assertFalse(encoded.contains("ProductDetail"))
        assertFalse(encoded.contains("New product"))
    }

    @Test
    fun a_retired_product_route_cannot_be_restored() {
        assertFailsWith<SerializationException> {
            shopNavJson.decodeFromString(
                PolymorphicSerializer(AppNavKey::class),
                """{"type":"com.effyshopping.shop.mobile.core.nav.CatalogProductRoute","id":"product"}""",
            )
        }
    }
}
