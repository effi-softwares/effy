package com.effyshopping.customer.mobile.features.catalog

import com.effyshopping.customer.mobile.commerce.contract.BannerDTO
import com.effyshopping.customer.mobile.commerce.contract.ProductBadge as ProductBadgeDTO
import com.effyshopping.customer.mobile.commerce.contract.StorefrontHomeDTO
import com.effyshopping.customer.mobile.commerce.contract.StorefrontProductCardDTO
import com.effyshopping.customer.mobile.commerce.contract.StorefrontRailDTO
import com.effyshopping.customer.mobile.features.catalog.data.toDomain
import com.effyshopping.customer.mobile.features.catalog.domain.ProductBadge
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class CatalogMappersTest {

    @Test
    fun mapsProductCardIncludingImageAndBadges() {
        val dto = StorefrontProductCardDTO(
            available = true,
            badges = listOf(ProductBadgeDTO.OnSale, ProductBadgeDTO.New),
            brand = "Effy Farms",
            compareAtAmount = "8.00",
            currency = "AUD",
            id = "p1",
            imageURL = "https://signed/p1.jpg",
            name = "Milk",
            priceAmount = "5.00",
        )

        val card = dto.toDomain()

        assertEquals("p1", card.id)
        assertEquals("Milk", card.name)
        assertEquals("Effy Farms", card.brand)
        assertEquals("https://signed/p1.jpg", card.imageUrl)
        assertEquals("5.00", card.priceAmount)
        assertEquals("8.00", card.compareAtAmount)
        assertTrue(card.available)
        assertEquals(listOf(ProductBadge.ON_SALE, ProductBadge.NEW), card.badges)
    }

    @Test
    fun mapsNullableFieldsToNull() {
        val dto = StorefrontProductCardDTO(
            available = true,
            badges = emptyList(),
            brand = null,
            compareAtAmount = null,
            currency = "AUD",
            id = "p2",
            imageURL = null,
            name = "Bread",
            priceAmount = "3.00",
        )

        val card = dto.toDomain()

        assertNull(card.brand)
        assertNull(card.imageUrl)
        assertNull(card.compareAtAmount)
        assertTrue(card.badges.isEmpty())
    }

    @Test
    fun mapsHomeWithRailsAndBanner() {
        val home = StorefrontHomeDTO(
            banners = listOf(BannerDTO(key = "welcome", title = "Shop Effy", subtitle = "Fresh", href = "/search")),
            rails = listOf(
                StorefrontRailDTO(
                    key = "featured",
                    title = "Featured",
                    products = listOf(
                        StorefrontProductCardDTO(
                            available = true, badges = emptyList(), brand = null, compareAtAmount = null,
                            currency = "AUD", id = "p1", imageURL = null, name = "Milk", priceAmount = "5.00",
                        ),
                    ),
                ),
            ),
        ).toDomain()

        assertEquals(1, home.banners.size)
        assertEquals("welcome", home.banners.first().key)
        assertEquals(1, home.rails.size)
        assertEquals("Featured", home.rails.first().title)
        assertEquals("p1", home.rails.first().products.first().id)
    }
}
