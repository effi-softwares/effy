package com.effyshopping.customer.mobile.features.catalog

import com.effyshopping.customer.mobile.commerce.contract.BannerDTO
import com.effyshopping.customer.mobile.commerce.contract.BannerTarget as BannerTargetDTO
import com.effyshopping.customer.mobile.commerce.contract.Kind
import com.effyshopping.customer.mobile.commerce.contract.ProductBadge as ProductBadgeDTO
import com.effyshopping.customer.mobile.commerce.contract.StorefrontHomeDTO
import com.effyshopping.customer.mobile.commerce.contract.StorefrontProductCardDTO
import com.effyshopping.customer.mobile.commerce.contract.StorefrontRailDTO
import com.effyshopping.customer.mobile.features.catalog.data.toDomain
import com.effyshopping.customer.mobile.features.catalog.domain.BannerTarget
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
    // ── Banner advertising fields (028 T040) ────────────────────────────────────────────────────

    @Test
    fun mapsTheAdvertisingFieldsOnABanner() {
        val banner = BannerDTO(
            key = "promo-1",
            title = "20% off your first order",
            subtitle = "Stock up",
            href = "/search",
            code = "FIRST20",
            terms = "On orders over $30.00",
            position = 2L,
            target = BannerTargetDTO(kind = Kind.Sale),
        ).toDomain()

        assertEquals("FIRST20", banner.code, "a banner without its code is decoration a shopper cannot act on")
        assertEquals("On orders over $30.00", banner.terms)
        assertEquals(2, banner.position)
        assertEquals(BannerTarget.Sale, banner.target)
    }

    @Test
    fun anAbsentPositionMeansAboveTheFirstSection() {
        val banner = BannerDTO(key = "b", title = "T", href = null).toDomain()

        // ⚠ The wire type is Long? (from WireInt / @asType integer, so the client cannot send `1.0`
        // into a Go int — 027's defect). Absent must land somewhere sensible rather than crash.
        assertEquals(0, banner.position)
    }

    @Test
    fun mapsEachTargetKind() {
        fun target(dto: BannerTargetDTO) =
            BannerDTO(key = "b", title = "T", href = null, target = dto).toDomain().target

        assertEquals(BannerTarget.Search, target(BannerTargetDTO(kind = Kind.Search)))
        assertEquals(BannerTarget.Sale, target(BannerTargetDTO(kind = Kind.Sale)))
        assertEquals(
            BannerTarget.Category("grocery"),
            target(BannerTargetDTO(kind = Kind.Category, categoryKey = "grocery")),
        )
        assertEquals(
            BannerTarget.Product("p1"),
            target(BannerTargetDTO(kind = Kind.Product, productID = "p1")),
        )
    }

    @Test
    fun aMalformedTargetCostsOneTapNotTheStorefront() {
        // The generator flattens the TS discriminated union into a kind + optional fields, so a
        // `category` with no categoryKey is REPRESENTABLE on the wire and meaningless here.
        val banner = BannerDTO(
            key = "b",
            title = "T",
            href = null,
            target = BannerTargetDTO(kind = Kind.Category, categoryKey = null),
        ).toDomain()

        assertNull(
            banner.target,
            "a malformed target must render the banner non-tappable, not throw and take Home with it",
        )
    }
}
