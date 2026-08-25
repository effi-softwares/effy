package com.effyshopping.customer.mobile.features.payment

import com.effyshopping.customer.mobile.commerce.contract.BillingDetailsDTO
import com.effyshopping.customer.mobile.commerce.contract.ListPaymentMethodsResponse
import com.effyshopping.customer.mobile.commerce.contract.PaymentMethodDTO
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The Kotlin half of the 051 payment wire contract.
 *
 * ⚠ The literals below are duplicated BYTE-FOR-BYTE from the Go half at
 * apis/core-api/internal/features/checkout/payment_wire_contract_test.go. Neither side generates or
 * imports the fixture — a shared literal moves WITH a bug, while two hand-kept copies make a
 * divergence show up as a failure. That is the 028 pattern, and it was proved there by breaking it
 * two ways.
 *
 * ⚠ WHY THIS EXISTS. 027 R13 lost days because Kotlin serialised a count as `Double`, so the wire
 * carried `1.0` and Go's encoding/json refused it into an int. Every unit test on both sides passed
 * throughout, because the fakes spoke Kotlin at both ends and never crossed the wire. A card expiry is
 * a count; this test is the thing standing between that lesson and its fourth recurrence.
 */
class PaymentWireContractTest {

    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    companion object {
        // Byte-identical to paymentMethodWire in payment_wire_contract_test.go.
        const val PAYMENT_METHOD =
            """{"id":"pm_123","brand":"visa","last4":"4242","expMonth":4,"expYear":2028,"isDefault":true,"usable":true}"""

        // Byte-identical to paymentMethodUnusableWire.
        const val PAYMENT_METHOD_UNUSABLE =
            """{"id":"pm_456","brand":"mastercard","last4":"8210","expMonth":7,"expYear":2026,"isDefault":false,"usable":false,"unusableReason":"This card has expired."}"""

        // Byte-identical to billingDetailsWire.
        const val BILLING_DETAILS =
            """{"name":"Jane Smith","email":"jane@example.com","address":{"line1":"1 Test St","line2":"","city":"Richmond","state":"VIC","postalCode":"3121","country":"AU"}}"""
    }

    @Test
    fun `parses a usable payment method from the servers exact bytes`() {
        val pm = json.decodeFromString<PaymentMethodDTO>(PAYMENT_METHOD)
        assertEquals("pm_123", pm.id)
        assertEquals("visa", pm.brand)
        assertEquals("4242", pm.last4)
        assertEquals(4L, pm.expMonth)
        assertEquals(2028L, pm.expYear)
        assertTrue(pm.isDefault)
        assertTrue(pm.usable)
        // A usable card omits the reason entirely; the field is absent, not empty.
        assertNull(pm.unusableReason)
    }

    @Test
    fun `an unusable card always carries a reason a shopper can read`() {
        val pm = json.decodeFromString<PaymentMethodDTO>(PAYMENT_METHOD_UNUSABLE)
        assertFalse(pm.usable)
        // ⚠ FR-023. A card shown as unusable with no reason is a refusal the shopper cannot act on,
        // which is indistinguishable from a bug.
        assertEquals("This card has expired.", pm.unusableReason)
    }

    /**
     * ⚠ THE 027 R13 GUARD.
     *
     * `expMonth` and `expYear` must round-trip as integers. Re-encoding and comparing against the
     * server's exact bytes is what catches a Double: `4.0` would serialise back as `4.0` and fail here,
     * where an assertion on the decoded VALUE alone would happily pass, because 4.0 == 4.
     */
    @Test
    fun `expiry round-trips as an integer and never as a float`() {
        val pm = json.decodeFromString<PaymentMethodDTO>(PAYMENT_METHOD)
        val reEncoded = json.encodeToString(PaymentMethodDTO.serializer(), pm)
        assertTrue(
            reEncoded.contains("\"expMonth\":4") && reEncoded.contains("\"expYear\":2028"),
            "expiry serialised with a decimal point — this is the 027 R13 defect: $reEncoded",
        )
        assertFalse(
            reEncoded.contains("4.0") || reEncoded.contains("2028.0"),
            "a count crossed the wire as a float: $reEncoded",
        )
    }

    @Test
    fun `parses the billing details the client must send back at confirmation`() {
        val bd = json.decodeFromString<BillingDetailsDTO>(BILLING_DETAILS)
        assertEquals("Jane Smith", bd.name)
        assertEquals("1 Test St", bd.address.line1)
        assertEquals("3121", bd.address.postalCode)
        // ⚠ The whole point of the feature: the shopper is never asked for a country, so the server
        // supplies one and the client must receive it. An absent country is what let the provider guess.
        assertEquals("AU", bd.address.country)
    }

    @Test
    fun `an empty list parses as no kept cards`() {
        val res = json.decodeFromString<ListPaymentMethodsResponse>("""{"paymentMethods":[]}""")
        assertTrue(res.paymentMethods.isEmpty())
    }
}
