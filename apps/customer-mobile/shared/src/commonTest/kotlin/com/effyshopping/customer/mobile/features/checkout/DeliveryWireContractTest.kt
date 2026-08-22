package com.effyshopping.customer.mobile.features.checkout

import com.effyshopping.customer.mobile.commerce.contract.DeliveryMethod
import com.effyshopping.customer.mobile.commerce.contract.DeliveryQuoteDTO
import com.effyshopping.customer.mobile.commerce.contract.ServiceabilityDTO
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The Kotlin half of the delivery wire contract (047, research R14).
 *
 * ⚠ The literals below are duplicated BYTE-FOR-BYTE from the Go halves at
 * apis/core-api/internal/features/storefront/delivery_wire_contract_test.go (serviceability) and
 * apis/core-api/internal/features/checkout/delivery_wire_contract_test.go (the quote). Neither side
 * generates or imports the fixture — a shared literal moves WITH a bug; two hand-kept copies make a
 * divergence show up as a failure.
 *
 * ⚠ WHY THIS EXISTS. 027 lost days because Kotlin serialised money/counts as `Double` and Go could not
 * unmarshal `1.0` into an int. Delivery money crosses as a 2-dp decimal STRING for exactly that reason;
 * this test proves the generated Kotlin parses Go's exact bytes and that `feeAmount` stays a String.
 */
class DeliveryWireContractTest {

    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    companion object {
        // Byte-identical to serviceabilityWire in storefront/delivery_wire_contract_test.go.
        const val SERVICEABILITY_WIRE = """{"postcode":"3121","serviced":true}"""

        // Byte-identical to deliveryQuoteWire in checkout/delivery_wire_contract_test.go.
        const val DELIVERY_QUOTE_WIRE =
            """{"postcode":"3121","serviced":true,"sameDayAvailableUntil":"2026-08-24T13:00:00+10:00","packages":[{"shopRef":"pkg-1","options":[{"method":"standard","feeAmount":"6.00","promisedFrom":null,"promisedTo":null},{"method":"same_day","feeAmount":"11.00","promisedFrom":"2026-08-24","promisedTo":"2026-08-24"}]}],"expiresAt":"2026-08-24T12:20:00+10:00"}"""
    }

    @Test
    fun `Kotlin decodes Go's serviceability bytes`() {
        val dto = json.decodeFromString<ServiceabilityDTO>(SERVICEABILITY_WIRE)
        assertEquals("3121", dto.postcode)
        assertTrue(dto.serviced)
    }

    @Test
    fun `Kotlin decodes Go's delivery-quote bytes - with the fee as a String`() {
        val dto = json.decodeFromString<DeliveryQuoteDTO>(DELIVERY_QUOTE_WIRE)

        assertEquals("3121", dto.postcode)
        assertTrue(dto.serviced)
        assertEquals("2026-08-24T13:00:00+10:00", dto.sameDayAvailableUntil)
        assertEquals(1, dto.packages.size)

        val pkg = dto.packages[0]
        // ⚠ shopRef is opaque — never a shop id (FR-033).
        assertEquals("pkg-1", pkg.shopRef)
        assertEquals(2, pkg.options.size)

        val standard = pkg.options[0]
        assertEquals(DeliveryMethod.Standard, standard.method)
        // ⚠ The 027 R13 guard: money is a String, not a number. If the contract ever regressed to a
        // numeric type this would not compile / would fail to parse "6.00".
        assertEquals("6.00", standard.feeAmount)

        val sameDay = pkg.options[1]
        assertEquals(DeliveryMethod.SameDay, sameDay.method)
        assertEquals("11.00", sameDay.feeAmount)
        assertEquals("2026-08-24", sameDay.promisedFrom)
    }

    @Test
    fun `an unserviced quote carries no packages`() {
        val dto = json.decodeFromString<DeliveryQuoteDTO>(
            """{"postcode":"3999","serviced":false,"sameDayAvailableUntil":null,"packages":[],"expiresAt":""}""",
        )
        assertFalse(dto.serviced)
        assertTrue(dto.packages.isEmpty())
    }
}
