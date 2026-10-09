package com.effyshopping.customer.mobile.features.checkout

import com.effyshopping.customer.mobile.commerce.contract.CreateCheckoutIntentRequest
import com.effyshopping.customer.mobile.commerce.contract.DeliveryQuoteDTO
import com.effyshopping.customer.mobile.commerce.contract.OrderSummaryDTO
import com.effyshopping.customer.mobile.features.checkout.data.deliveryRefusalOrNull
import com.effyshopping.customer.mobile.features.checkout.data.toDomain
import com.effyshopping.customer.mobile.features.checkout.data.toRequest
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryChoiceRefusal
import com.effyshopping.customer.mobile.features.checkout.domain.ChosenWindow
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryType
import com.effyshopping.customer.mobile.features.checkout.domain.OrderDelivery
import com.effyshopping.customer.mobile.features.checkout.domain.PlaceOrder
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json

/**
 * 079 — the courier checkout, at the wire: what the server sends for an address a courier delivers
 * to, what this app sends back, and the refusal when the two no longer agree.
 *
 * ⚠ A COURIER QUOTE HAS ONE FEE AND NOTHING TO CHOOSE. Read as an Effy quote it would be a serviced
 * order with no window to pick and no way to pay; the first test is what stops that.
 */
class CourierWireTest {
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    companion object {
        /** What POST /commerce/v1/checkout/quote answers when a courier delivers (commerce `toQuoteDTO`). */
        const val COURIER_QUOTE_WIRE =
            """{"postcode":"7000","serviced":true,"coverage":"courier","expiresAt":"2026-10-09T12:20:00+11:00","freeDeliveryRemainingAmount":null,"courier":{"estimate":"2–4 business days","fee":{"lines":[{"kind":"delivery","amount":"9.00"}],"totalAmount":"9.00"},"reason":"out_of_coverage"}}"""

        const val NO_WINDOW_QUOTE_WIRE =
            """{"postcode":"3121","serviced":true,"coverage":"courier","expiresAt":"2026-10-09T12:20:00+11:00","freeDeliveryRemainingAmount":"11.00","courier":{"estimate":"2–4 business days","fee":{"lines":[{"kind":"delivery","amount":"9.00"}],"totalAmount":"9.00"},"reason":"no_window"}}"""
    }

    @Test
    fun `a courier quote is a courier delivery with its fee - never a free Effy one with nothing to choose`() {
        val q = json.decodeFromString<DeliveryQuoteDTO>(COURIER_QUOTE_WIRE).toDomain()
        assertTrue(q.serviced)
        assertEquals(DeliveryType.COURIER, q.deliveryType)
        val courier = assertNotNull(q.courier)
        assertEquals("2–4 business days", courier.estimate)
        assertFalse(courier.noWindowLeft)
        assertEquals("9.00", courier.fee.totalAmount)
        // Whatever the shopper has (not) chosen, the fee is the courier's.
        assertEquals("9.00", q.feeFor(null)?.totalAmount)
        assertEquals("9.00", q.feeFor(ChosenWindow("any-slot", "2026-10-09"))?.totalAmount)
        assertNull(q.effyWindows)
    }

    @Test
    fun `no window left - the same shape, and the app is told to say so first`() {
        val q = json.decodeFromString<DeliveryQuoteDTO>(NO_WINDOW_QUOTE_WIRE).toDomain()
        assertEquals(true, q.courier?.noWindowLeft)
        assertEquals("11.00", q.freeDeliveryRemainingAmount)
    }

    @Test
    fun `the intent says which type the screen showed`() {
        fun sent(type: DeliveryType?) = json.encodeToString(CreateCheckoutIntentRequest.serializer(), PlaceOrder(addressId = "a1", deliveryType = type).toRequest())
        assertTrue(sent(DeliveryType.COURIER).contains(""""deliveryType":"courier""""), sent(DeliveryType.COURIER))
        assertTrue(sent(DeliveryType.EFFY).contains(""""deliveryType":"effy""""))
        assertFalse(sent(null).contains("deliveryType"), sent(null))
    }

    @Test
    fun `the refusal when who delivers has changed carries the fresh quote`() {
        val wire = """{"type":"https://effyshopping.com/problems/conflict","title":"Conflict","status":409,"code":"delivery_type_changed","quote":$COURIER_QUOTE_WIRE}"""
        val refused = assertNotNull(deliveryRefusalOrNull(wire))
        assertEquals(DeliveryChoiceRefusal.DeliveryTypeChanged, refused.reason)
        assertEquals(DeliveryType.COURIER, refused.quote?.deliveryType)
    }

    @Test
    fun `an order in the list says who delivers it - and one placed before delivery types says nothing`() {
        fun row(extra: String) = json.decodeFromString<OrderSummaryDTO>(
            """{"id":"o1","orderNumber":"EFY-1","status":"paid","placedAt":null,"itemCount":2,"grandTotalAmount":"19.00","currency":"AUD"$extra}""",
        ).toDomain()
        assertEquals(OrderDelivery(DeliveryType.COURIER, "2–4 business days"), row(""","delivery":{"type":"courier","courierEstimate":"2–4 business days"}""").delivery)
        assertEquals(OrderDelivery(DeliveryType.EFFY, null), row(""","delivery":{"type":"effy","courierEstimate":null}""").delivery)
        assertNull(row("").delivery)
    }
}
