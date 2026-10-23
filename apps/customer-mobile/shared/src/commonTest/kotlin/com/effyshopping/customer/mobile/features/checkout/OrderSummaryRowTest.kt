package com.effyshopping.customer.mobile.features.checkout

import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryPromise
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryType
import com.effyshopping.customer.mobile.features.checkout.domain.OrderDelivery
import com.effyshopping.customer.mobile.core.presentation.EffyStatusKind
import com.effyshopping.customer.mobile.features.checkout.domain.OrderStage
import com.effyshopping.customer.mobile.features.checkout.domain.OrderSummary
import com.effyshopping.customer.mobile.features.checkout.presentation.orderArrivalLine
import com.effyshopping.customer.mobile.features.checkout.presentation.orderStageWord
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** The Orders row says where an order is and when it arrives; a missing field degrades, never to an invented stage or arrival. */
class OrderSummaryRowTest {

    private fun order(
        status: String = "paid",
        stage: OrderStage? = null,
        fullyRefunded: Boolean = false,
    ) = OrderSummary(
        id = "o1", orderNumber = "EF-1", status = status, itemCount = 3,
        grandTotalAmount = "20.00", currency = "AUD", stage = stage, fullyRefunded = fullyRefunded,
        delivery = OrderDelivery(type = DeliveryType.EFFY, courierEstimate = null, promise = DeliveryPromise.WINDOW),
    )

    @Test
    fun `the server stage is what the pill says`() {
        assertEquals("On the way" to EffyStatusKind.InProgress, orderStageWord(order(stage = OrderStage.OnTheWay)))
        assertEquals("Delivered" to EffyStatusKind.Done, orderStageWord(order(stage = OrderStage.Delivered)))
    }

    @Test
    fun `a refund outranks the stage`() {
        assertEquals("Refunded" to EffyStatusKind.Inert, orderStageWord(order(stage = OrderStage.Delivered, fullyRefunded = true)))
    }

    @Test
    fun `an order with no stage falls back to its payment status`() {
        assertEquals("Paid" to EffyStatusKind.InProgress, orderStageWord(order(stage = null)))
        assertEquals("Payment failed" to EffyStatusKind.Problem, orderStageWord(order(status = "failed")))
    }

    @Test
    fun `no promise means no arrival line, never a guess`() {
        assertNull(orderArrivalLine(order()))
        assertNull(orderArrivalLine(order(status = "cancelled")))
    }
}
