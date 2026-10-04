package com.effyshopping.shop.mobile.features.catalog.data

import com.effyshopping.shop.mobile.contract.ProductDetailDTO
import com.effyshopping.shop.mobile.features.catalog.domain.ReviewState
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * 067 — the review fields, decoded from the JSON the server actually sends rather than from a DTO
 * built by hand. A hand-built DTO agrees with this file's author; the wire agrees with the backend.
 */
class ReviewMappersTest {
    private val json = Json { ignoreUnknownKeys = true }

    private fun detail(extra: String, status: String = "active"): ProductDetailDTO = json.decodeFromString(
        """
        {"id":"p1","shopId":"s1","productTypeId":"t1","typeName":"Drink","primaryCategoryId":"c1",
         "categoryName":"Dairy alternatives","name":"Oat milk","sku":null,"gtin":null,"brand":"Oatly",
         "priceAmount":"4.00","currency":"AUD","compareAtAmount":null,"shortDescription":"One litre",
         "longDescription":null,"weightGrams":1000,"weightIsAssumed":false,"status":"$status",
         "attributes":[],"media":[],"sections":[],"missingMandatoryAttributes":[],
         "createdAt":"2026-10-01T00:00:00Z","updatedAt":"2026-10-01T00:00:00Z"$extra}
        """.trimIndent(),
    )

    @Test
    fun a_reply_with_no_review_state_reads_as_the_behaviour_before_review_existed() {
        // ⚠ Absence must never read as "in review": that would tell a shop on an older backend that
        // its whole catalogue was waiting on Effy.
        assertEquals(ReviewState.LIVE, detail("").toDomain().reviewState)
        assertEquals(ReviewState.DRAFT, detail("", status = "draft").toDomain().reviewState)
    }

    @Test
    fun the_shop_sees_its_own_price_and_the_customer_price() {
        val d = detail(""","reviewState":"live","shopPriceAmount":"4.00","customerPriceAmount":"4.60"""").toDomain()
        assertEquals("4.00", d.priceAmount)
        assertEquals("4.60", d.customerPriceAmount)
    }

    @Test
    fun a_never_approved_product_has_no_customer_price_to_show() {
        val d = detail(
            ""","reviewState":"in_review","shopPriceAmount":"4.00","customerPriceAmount":"4.00"""",
            status = "draft",
        ).toDomain()
        assertFalse(d.reviewState.approved)
        assertNull(d.customerPriceAmount)
    }

    @Test
    fun a_sent_back_product_carries_the_reason() {
        val d = detail(""","reviewState":"sent_back","reviewReason":"The photo shows a different product."""", "draft").toDomain()
        assertEquals(ReviewState.SENT_BACK, d.reviewState)
        assertTrue(d.reviewState.needsAttention)
        assertEquals("The photo shows a different product.", d.reviewReason)
    }

    @Test
    fun a_pending_change_lists_only_what_differs_with_the_shops_price_on_both_sides() {
        val d = detail(
            ""","reviewState":"live_change_pending","shopPriceAmount":"4.00","customerPriceAmount":"4.60",
               "pendingChange":{"state":"in_review","reason":null,"submittedAt":"2026-10-03T00:00:00Z",
                 "proposed":{"name":"Oat milk barista","priceAmount":"4.50"},"media":null}""",
        ).toDomain()
        val changes = d.pendingChange!!.changes
        assertEquals(listOf("Name", "Your price"), changes.map { it.label })
        assertEquals("AUD 4.00", changes[1].now)
        assertEquals("AUD 4.50", changes[1].proposed)
        // The page still describes the LIVE product.
        assertEquals("Oat milk", d.name)
        assertEquals("4.00", d.priceAmount)
        // ⚠ Never the customer price, never a margin.
        assertFalse(changes.any { "4.60" in it.now || "4.60" in it.proposed })
    }
}
