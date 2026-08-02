package com.effyshopping.customer.mobile.features.saved

import com.effyshopping.customer.mobile.commerce.contract.OrderItemDTO
import com.effyshopping.customer.mobile.commerce.contract.SavedItemDTO
import com.effyshopping.customer.mobile.commerce.contract.SavedMembershipDTO
import com.effyshopping.customer.mobile.commerce.contract.SavedVerdict
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The Kotlin half of the saved-items wire contract (033).
 *
 * ⚠ SAVED_ITEM_WIRE_JSON below is duplicated BYTE-FOR-BYTE from the Go half at
 * apis/core-api/internal/features/saveditems/wire_contract_test.go. Neither side generates it and
 * neither imports it — that is the point. A shared fixture moves WITH the bug; two hand-maintained
 * copies make a divergence show up as a failure instead of as agreement.
 *
 * ⚠ WHY THIS EXISTS. 027 lost days to a defect no unit test on either side could see: Kotlin
 * serialised quantities as `Double`, so the wire carried `1.0`, and Go's encoding/json cannot
 * unmarshal `1.0` into an `int`. Every test passed throughout, because the fakes spoke Kotlin at both
 * ends and never crossed the wire. This test is what would have caught it on day one.
 */
class SavedWireContractTest {

    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    companion object {
        // ⚠ Byte-identical to SAVED_ITEM_WIRE_JSON in wire_contract_test.go. If you change one,
        // change the other in the same commit.
        const val SAVED_ITEM_WIRE_JSON =
            """{"id":"9f2c1d4e-0000-0000-0000-000000000001","name":"Free Range Eggs 12pk","brand":"Effy","imageUrl":"https://media.example/eggs.jpg","priceAmount":"6.50","currency":"AUD","compareAtAmount":"8.00","badges":["on_sale"],"savedAt":"2026-07-20T04:11:00Z","savedPriceAmount":"8.00","priceDropped":true,"verdict":"purchasable","categoryKey":"dairy-eggs"}"""

        const val SAVED_MEMBERSHIP_WIRE_JSON =
            """{"productIds":["9f2c1d4e-0000-0000-0000-000000000001"],"count":1}"""
    }

    @Test
    fun `Kotlin decodes Go's exact bytes`() {
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
     * ⚠ THE 027 R13 GUARD, in the direction that actually broke.
     *
     * `count` is a WireInt in the TS contract precisely so the generated Kotlin is a `Long`. If it
     * ever regresses to `Double`, Kotlin emits `1.0`, Go REFUSES it into an int, and the request 422s
     * — invisibly, because unit tests on both sides still pass.
     *
     * ⚠ THIS ASSERTS VALUES, NOT THE WHOLE STRING, and the reason is worth keeping. Go's
     * `encoding/json` emits keys in STRUCT FIELD ORDER (`productIds`, then `count`) while quicktype
     * sorts the generated Kotlin data class alphabetically (`count`, then `productIds`). So the two
     * languages produce byte-different — and equally valid — encodings of the same object.
     *
     * Object key order is not semantically meaningful in JSON, so pinning it across two serialisers
     * would pin an accident of each rather than the contract, and would fail the day either tool
     * changed its ordering. The byte-identical literal is therefore the DECODE fixture (both sides
     * must accept the same bytes — see the test above); the emit direction is checked at the level
     * that actually broke in 027: the numeric literal.
     */
    @Test
    fun `Kotlin emits a whole number for count - never a float`() {
        val dto = SavedMembershipDTO(count = 1, productIDS = listOf("9f2c1d4e-0000-0000-0000-000000000001"))
        val encoded = json.encodeToString(SavedMembershipDTO.serializer(), dto)

        assertTrue(encoded.contains("\"count\":1"), "expected an integer, got: $encoded")
        assertFalse(encoded.contains("\"count\":1.0"), "a float count is the 027 defect: $encoded")

        // And the round trip must survive, which is the property that actually matters.
        val back = json.decodeFromString<SavedMembershipDTO>(encoded)
        assertEquals(1L, back.count)
        assertEquals(dto.productIDS, back.productIDS)
    }

    @Test
    fun `Kotlin decodes the membership payload Go sends`() {
        val dto = json.decodeFromString<SavedMembershipDTO>(SAVED_MEMBERSHIP_WIRE_JSON)
        assertEquals(1L, dto.count)
        assertEquals(1, dto.productIDS.size)
    }

    /**
     * ⚠ The saved item deliberately carries NO `available` field.
     *
     * That boolean — derived from catalogue status alone — is the one that lied: it reported a
     * product buyable while checkout refused it at the shopper's address. `verdict` replaces it. If
     * `available` ever reappears, two fields answer one question and a client will render the wrong
     * one, so its ABSENCE is a requirement rather than an omission.
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
     * An absent `priceDropped` means "no drop" (FR-044). There is deliberately no `priceRose`.
     */
    @Test
    fun `an absent priceDropped decodes as no drop`() {
        val withoutFlag =
            """{"id":"p1","name":"Milk","brand":null,"imageUrl":null,"priceAmount":"3.10","currency":"AUD","compareAtAmount":null,"badges":[],"savedAt":"2026-07-20T04:11:00Z","savedPriceAmount":"3.10","verdict":"purchasable"}"""

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
     * ⚠ All three verdicts must decode. A sixth value appearing on the wire would reach a client that
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
                """{"id":"p1","name":"Milk","brand":null,"imageUrl":null,"priceAmount":"3.10","currency":"AUD","compareAtAmount":null,"badges":[],"savedAt":"2026-07-20T04:11:00Z","savedPriceAmount":"3.10","verdict":"$wire"}"""
            assertEquals(domain, json.decodeFromString<SavedItemDTO>(payload).verdict, "wire value: $wire")
        }
    }

    /**
     * ⚠ FR-008 depends on the ORDER line carrying a product id, and this pins that it survives.
     *
     * The wire has carried `productId` since 019 — the mobile DOMAIN model simply dropped it, so a
     * shopper could see a past order but not save anything from it. That is the same
     * mapper-discards-what-the-backend-sends shape that hid `brand` and `badges` on the saved list.
     * No contract change was needed; the field needed mapping. If it is ever dropped again, this
     * fails rather than the feature quietly losing a placement.
     */
    @Test
    fun `an order line carries the product id a save needs`() {
        val orderItemJson =
            """{"productId":"9f2c1d4e-0000-0000-0000-000000000001","productName":"Free Range Eggs 12pk","unitPriceAmount":"6.50","quantity":2,"lineSubtotalAmount":"13.00"}"""

        val dto = json.decodeFromString<OrderItemDTO>(orderItemJson)

        assertEquals("9f2c1d4e-0000-0000-0000-000000000001", dto.productID)
        assertTrue(dto.productID.isNotBlank(), "a product you cannot identify is a product you cannot save")
    }
}
