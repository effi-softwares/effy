package com.effyshopping.mobile.kit

import com.effyshopping.mobile.kit.nav.AppNavKey
import com.effyshopping.mobile.kit.nav.navKeySerializersModule
import kotlinx.serialization.PolymorphicSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.modules.subclass
import kotlin.test.Test
import kotlin.test.assertEquals

@Serializable
private data class HomeRoot(val unused: Boolean = true) : AppNavKey

@Serializable
private data class ProductDetail(val id: String, val page: Int) : AppNavKey

/**
 * 015 T011 / research R6 / spike S1 (unit-testable half) — the polymorphic route serialization that iOS
 * saved-state restore REQUIRES. Kotlin/Native has no reflection-based state, so every route must round-trip
 * through a registered polymorphic [navKeySerializersModule]. This test runs on every target (incl. native)
 * and guards that the approach works; the remaining half of S1 (actual iOS process-death restore) is the
 * operator's simulator step.
 */
class NavKeySerializationTest {

    private val json = Json {
        serializersModule = navKeySerializersModule {
            subclass(HomeRoot::class, HomeRoot.serializer())
            subclass(ProductDetail::class, ProductDetail.serializer())
        }
    }

    private fun roundTrip(route: AppNavKey): AppNavKey {
        val encoded = json.encodeToString(PolymorphicSerializer(AppNavKey::class), route)
        return json.decodeFromString(PolymorphicSerializer(AppNavKey::class), encoded)
    }

    @Test
    fun object_like_route_round_trips() {
        val route = HomeRoot()
        assertEquals(route, roundTrip(route))
    }

    @Test
    fun route_with_args_round_trips_preserving_data() {
        val route = ProductDetail(id = "sku-42", page = 3)
        val restored = roundTrip(route)
        assertEquals(route, restored)
        assertEquals(ProductDetail("sku-42", 3), restored)
    }
}
