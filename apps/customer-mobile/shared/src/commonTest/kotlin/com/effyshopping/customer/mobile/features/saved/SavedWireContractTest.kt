package com.effyshopping.customer.mobile.features.saved

import com.effyshopping.customer.mobile.commerce.contract.OrderItemDTO
import com.effyshopping.customer.mobile.commerce.contract.SavedItemDTO
import com.effyshopping.customer.mobile.commerce.contract.SavedMembershipDTO
import com.effyshopping.customer.mobile.commerce.contract.SavedListDTO
import com.effyshopping.customer.mobile.features.saved.data.listRefusal
import com.effyshopping.customer.mobile.features.saved.domain.ListRefusal
import com.effyshopping.customer.mobile.commerce.contract.SavedVerdict
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The Kotlin half of the saved-items wire contract. `apis/edge-api/commerce/src/wire.contract.test.ts` parses
 * this file, takes each `const val` and compares it with what the real mapper produces; here the same
 * literal must decode. Renaming a constant breaks that test: rename it there too.
 */
class SavedWireContractTest {

    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    companion object {
        // Read by the backend's wire.contract.test.ts (see the header). If you change it,
        // change the other in the same commit.
        const val SAVED_ITEM_WIRE_JSON =
            """{"id":"9f2c1d4e-0000-0000-0000-000000000001","name":"Free Range Eggs 12pk","brand":"Effy","imageUrl":"https://media.example/eggs.jpg","priceAmount":"6.50","currency":"AUD","compareAtAmount":"8.00","badges":["on_sale"],"savedAt":"2026-07-20T04:11:00Z","savedPriceAmount":"8.00","priceDropped":true,"verdict":"purchasable","categoryKey":"dairy-eggs","variantId":"9f2c1d4e-0000-0000-0000-0000000000a1","variantLabel":"12 pack","variantCount":2,"unitPrice":{"amount":"0.54","basis":"each"}}"""

        // Added `namedProductIds`. Byte-identical to SAVED_MEMBERSHIP_WIRE_JSON in
        // the backend's wire.contract.test.ts.
        const val SAVED_MEMBERSHIP_WIRE_JSON =
            """{"productIds":["9f2c1d4e-0000-0000-0000-000000000001","1a7b0000-0000-0000-0000-000000000002"],"count":2,"namedProductIds":["9f2c1d4e-0000-0000-0000-000000000001"]}"""

        // Read by the backend's wire.contract.test.ts.
        const val SAVED_LISTS_WIRE_JSON =
            """[{"id":"default","isDefault":true,"name":null,"count":12,"onlyHereCount":9},{"id":"5d1e0000-0000-0000-0000-000000000005","isDefault":false,"name":"Weekly Items","count":5,"onlyHereCount":2,"containsProduct":true}]"""
    }

    @Test
    fun `Kotlin decodes the server's exact bytes`() {
        val dto = json.decodeFromString<SavedItemDTO>(SAVED_ITEM_WIRE_JSON)

        assertEquals("9f2c1d4e-0000-0000-0000-000000000001", dto.id)
        assertEquals("Free Range Eggs 12pk", dto.name)
        assertEquals("Effy", dto.brand)
        // ⚠ quicktype renames imageUrl → imageURL in Kotlin and carries @SerialName. If the annotation
        // is ever lost this line fails, which is the only warning we would get.
        assertEquals("https://media.example/eggs.jpg", dto.imageURL)
        assertEquals("6.50", dto.priceAmount)
        assertEquals("8.00", dto.savedPriceAmount)
        assertEquals(true, dto.priceDropped)
        assertEquals(SavedVerdict.Purchasable, dto.verdict)
        assertEquals("dairy-eggs", dto.categoryKey)
    }

    /**
     * `count` is a WireInt, so the generated Kotlin is a `Long` and emits `1`, never `1.0`. This asserts
     * values, not the whole string: the server and the generated class order keys differently, both
     * validly, so the byte-identical literal is the decode fixture only.
     */
    @Test
    fun `Kotlin emits a whole number for count - never a float`() {
        val dto = SavedMembershipDTO(count = 1, productIDS = listOf("9f2c1d4e-0000-0000-0000-000000000001"), namedProductIDS = emptyList())
        val encoded = json.encodeToString(SavedMembershipDTO.serializer(), dto)

        assertTrue(encoded.contains("\"count\":1"), "expected an integer, got: $encoded")
        assertFalse(encoded.contains("\"count\":1.0"), "a float count is the 027 defect: $encoded")

        // And the round trip must survive, which is the property that actually matters.
        val back = json.decodeFromString<SavedMembershipDTO>(encoded)
        assertEquals(1L, back.count)
        assertEquals(dto.productIDS, back.productIDS)
    }

    @Test
    fun `Kotlin decodes the membership payload the server sends`() {
        val dto = json.decodeFromString<SavedMembershipDTO>(SAVED_MEMBERSHIP_WIRE_JSON)
        assertEquals(2L, dto.count)
        assertEquals(2, dto.productIDS.size)
        assertEquals(listOf("9f2c1d4e-0000-0000-0000-000000000001"), dto.namedProductIDS)
    }

    @Test
    fun `Kotlin decodes the lists the server sends`() {
        val lists = json.decodeFromString<List<SavedListDTO>>(SAVED_LISTS_WIRE_JSON)
        assertEquals(2, lists.size)

        // The default list: addressed as "default", and it has NO name - "Saved" is this app's string.
        assertEquals("default", lists[0].id)
        assertTrue(lists[0].isDefault)
        assertEquals(null, lists[0].name)
        assertEquals(12L, lists[0].count)
        assertEquals(9L, lists[0].onlyHereCount)
        // Absent, not false, when the read named no product.
        assertEquals(null, lists[0].containsProduct)

        assertEquals("Weekly Items", lists[1].name)
        assertEquals(true, lists[1].containsProduct)
    }

    @Test
    fun `Kotlin emits whole numbers for list counts`() {
        val encoded = json.encodeToString(
            SavedListDTO.serializer(),
            SavedListDTO(count = 5, id = "x", isDefault = false, name = "Weekly Items", onlyHereCount = 2),
        )
        assertTrue(encoded.contains("\"count\":5"), "expected an integer, got: $encoded")
        assertTrue(encoded.contains("\"onlyHereCount\":2"), "expected an integer, got: $encoded")
        assertFalse(encoded.contains(".0"), "a float count is the 027 defect: $encoded")
    }

    /** The reason a refusal carries is the last segment of the problem's `type`. */
    @Test
    fun `every named refusal maps to a reason the app can act on`() {
        val base = "https://effyshopping.com/problems/"
        assertEquals(ListRefusal.NAME_TAKEN, listRefusal(base + "name-taken"))
        assertEquals(ListRefusal.INVALID_NAME, listRefusal(base + "invalid-name"))
        assertEquals(ListRefusal.LIST_LIMIT, listRefusal(base + "list-limit"))
        assertEquals(ListRefusal.DEFAULT_LIST, listRefusal(base + "default-list"))
        assertEquals(ListRefusal.LIST_NOT_FOUND, listRefusal(base + "list-not-found"))
        assertEquals(ListRefusal.IN_NAMED_LISTS, listRefusal(base + "in-named-lists"))
        assertEquals(ListRefusal.CAP_REACHED, listRefusal(base + "saved-items-cap-reached"))
        // Anything else is not a list refusal and falls back to the status-code mapping.
        assertEquals(null, listRefusal(base + "validation-failed"))
        assertEquals(null, listRefusal(null))
    }

    /**
     * The saved item deliberately carries NO `available` field.
     *
     * That boolean - derived from catalogue status alone - is the one that lied: it reported a
     * product buyable while checkout refused it at the shopper's address. `verdict` replaces it. If
     * `available` ever reappears, two fields answer one question and a client will render the wrong
     * one, so its absence is a requirement rather than an omission.
     */
    @Test
    fun `the saved item carries a verdict and no available flag`() {
        assertFalse(
            SAVED_ITEM_WIRE_JSON.contains("\"available\""),
            "a saved item reports `verdict`, never the catalogue-status boolean it replaced",
        )
        assertTrue(SAVED_ITEM_WIRE_JSON.contains("\"verdict\""))
    }

    /**
     * An absent `priceDropped` means "no drop". There is deliberately no `priceRose`.
     */
    @Test
    fun `an absent priceDropped decodes as no drop`() {
        val withoutFlag =
            """{"id":"p1","name":"Milk","brand":null,"imageUrl":null,"priceAmount":"3.10","currency":"AUD","compareAtAmount":null,"badges":[],"savedAt":"2026-07-20T04:11:00Z","savedPriceAmount":"3.10","variantId":null,"variantLabel":null,"variantCount":2,"unitPrice":null,"verdict":"purchasable"}"""

        val dto = json.decodeFromString<SavedItemDTO>(withoutFlag)
        assertEquals(null, dto.priceDropped)
        assertFalse(withoutFlag.contains("priceRose"), "this field must never exist")
    }

    @Test
    fun `an empty list decodes as empty - not as a failure`() {
        val items = json.decodeFromString<List<SavedItemDTO>>("[]")
        assertTrue(items.isEmpty())
    }

    /**
     * All three verdicts must decode. A sixth value appearing on the wire would reach a client that
     * cannot render it, which is why the mapper's `when` is exhaustive with no `else`.
     */
    @Test
    fun `every verdict in the vocabulary decodes`() {
        val expected = listOf(
            "purchasable" to SavedVerdict.Purchasable,
            "temporarily_unavailable" to SavedVerdict.TemporarilyUnavailable,
            "no_longer_sold" to SavedVerdict.NoLongerSold,
        )
        for ((wire, domain) in expected) {
            val payload =
                """{"id":"p1","name":"Milk","brand":null,"imageUrl":null,"priceAmount":"3.10","currency":"AUD","compareAtAmount":null,"badges":[],"savedAt":"2026-07-20T04:11:00Z","savedPriceAmount":"3.10","variantId":null,"variantLabel":null,"variantCount":2,"unitPrice":null,"verdict":"$wire"}"""
            assertEquals(domain, json.decodeFromString<SavedItemDTO>(payload).verdict, "wire value: $wire")
        }
    }

    /** An order line carries its product id, so a shopper can save from a past order. */
    @Test
    fun `an order line carries the product id a save needs`() {
        val orderItemJson =
            """{"orderItemId":"1a2b3c4d-0000-0000-0000-000000000009","productId":"9f2c1d4e-0000-0000-0000-000000000001","productName":"Free Range Eggs 12pk","variantId":"9f2c1d4e-0000-0000-0000-0000000000a1","variantLabel":"12 pack","ageRestricted":false,"unitPriceAmount":"6.50","quantity":2,"lineSubtotalAmount":"13.00"}"""

        val dto = json.decodeFromString<OrderItemDTO>(orderItemJson)

        assertEquals("9f2c1d4e-0000-0000-0000-000000000001", dto.productID)
        assertTrue(dto.productID.isNotBlank(), "a product you cannot identify is a product you cannot save")

        // The two IDS are different things and both are on the wire. `productId` is what a
        // save needs; `orderItemId` is what a refund request needs, because an order can carry
        // the same product on two lines and a product id cannot tell them apart. Naming one where the
        // other is expected does not error - the server's join matches nothing and the item is
        // silently dropped.
        assertEquals("1a2b3c4d-0000-0000-0000-000000000009", dto.orderItemID)
        assertNotEquals(dto.productID, dto.orderItemID, "a line id is not a product id")
    }
}
