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
 * The Kotlin half of the payment wire contract. `apis/edge-api/commerce/src/wire.contract.test.ts` parses
 * this file, takes each `const val` and compares it with what the real mapper produces; here the same
 * literal must decode. Renaming a constant breaks that test: rename it there too.
 */
class PaymentWireContractTest {

    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    companion object {
        // Read by the backend's wire.contract.test.ts.
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
        // FR-023. A card shown as unusable with no reason is a refusal the shopper cannot act on,
        // which is indistinguishable from a bug.
        assertEquals("This card has expired.", pm.unusableReason)
    }

    /**
     * `expMonth` and `expYear` round-trip as integers: re-encoding against the server's bytes catches a
     * Double (`4.0`), which a decoded-value assertion would miss.
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
        // The whole point of the feature: the shopper is never asked for a country, so the server
        // supplies one and the client must receive it. An absent country is what let the provider guess.
        assertEquals("AU", bd.address.country)
    }

    @Test
    fun `an empty list parses as no kept cards`() {
        val res = json.decodeFromString<ListPaymentMethodsResponse>("""{"paymentMethods":[]}""")
        assertTrue(res.paymentMethods.isEmpty())
    }
}
