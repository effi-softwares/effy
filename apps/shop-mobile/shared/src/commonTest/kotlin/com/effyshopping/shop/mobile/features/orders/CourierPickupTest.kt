package com.effyshopping.shop.mobile.features.orders

import com.effyshopping.shop.mobile.contract.CourierPickupDTO
import com.effyshopping.shop.mobile.contract.CourierPickupState as ContractState
import com.effyshopping.shop.mobile.core.error.AppError
import com.effyshopping.shop.mobile.features.orders.data.toDomain
import com.effyshopping.shop.mobile.features.orders.domain.AdvanceFulfillment
import com.effyshopping.shop.mobile.features.orders.domain.CourierPickup
import com.effyshopping.shop.mobile.features.orders.domain.CourierPickupState
import com.effyshopping.shop.mobile.features.orders.domain.FulfillmentState
import com.effyshopping.shop.mobile.features.orders.domain.GetFulfillment
import com.effyshopping.shop.mobile.features.orders.domain.HandOverToCourier
import com.effyshopping.shop.mobile.features.orders.domain.ListFulfillments
import com.effyshopping.shop.mobile.features.orders.domain.RecordItemProgress
import com.effyshopping.shop.mobile.features.orders.domain.canHandOver
import com.effyshopping.shop.mobile.features.orders.domain.courierPickupLine
import com.effyshopping.shop.mobile.features.orders.domain.pickupWhen
import com.effyshopping.shop.mobile.features.orders.presentation.OrdersViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/** 080 US2 — a courier collects the parcel from the shop. The words match shop-web's `courierPickup.ts`. */
@OptIn(ExperimentalCoroutinesApi::class)
class CourierPickupTest {
    private fun pickup(state: CourierPickupState = CourierPickupState.BOOKED, from: String? = "13:00", to: String? = "15:00", date: String? = "2026-10-15") =
        CourierPickup(state, date, from, to, "Test Courier", "Parcel", "REF123", "https://signed.example/label.pdf")

    @Test
    fun the_line_says_who_comes_and_when_in_the_web_console_s_words() {
        assertEquals("Courier pickup · Thu 15 Oct, 1–3 pm", courierPickupLine(pickup()))
        assertEquals("Thu 15 Oct, 11:30 am–1 pm", pickupWhen(pickup(from = "11:30", to = "13:00")))
        assertEquals("Courier pickup · Thu 15 Oct", courierPickupLine(pickup(from = null, to = null)))
        assertEquals("Courier pickup · being arranged", courierPickupLine(pickup(CourierPickupState.ARRANGING, date = null)))
        assertEquals("Handed over to courier", courierPickupLine(pickup(CourierPickupState.HANDED_OVER)))
        // A Sunday and a 1 January, to hold the weekday arithmetic.
        assertEquals("Courier pickup · Sun 18 Oct, 9–11 am", courierPickupLine(pickup(from = "09:00", to = "11:00", date = "2026-10-18")))
        assertEquals("Courier pickup · Fri 1 Jan", courierPickupLine(pickup(from = null, to = null, date = "2027-01-01")))
    }

    @Test
    fun only_a_booked_pickup_on_a_packed_parcel_can_be_handed_over() {
        assertTrue(canHandOver(pickup(), FulfillmentState.READY_FOR_PICKUP))
        assertFalse(canHandOver(pickup(), FulfillmentState.PICKING))
        assertFalse(canHandOver(pickup(CourierPickupState.ARRANGING), FulfillmentState.READY_FOR_PICKUP))
        assertFalse(canHandOver(null, FulfillmentState.READY_FOR_PICKUP))
    }

    @Test
    fun the_wire_maps_to_the_domain_including_the_label() {
        val p = CourierPickupDTO(
            courierName = "Test Courier", labelURL = "https://signed.example/l.pdf", pickupDate = "2026-10-15",
            pickupFrom = "13:00", pickupTo = "15:00", reference = "R1", serviceName = "Parcel", state = ContractState.HandedOver,
        ).toDomain()
        assertEquals(CourierPickupState.HANDED_OVER, p.state)
        assertEquals("https://signed.example/l.pdf", p.labelUrl)
    }

    @Test
    fun handing_over_records_it_once_and_the_order_reads_collected() = runTest {
        val base = sampleDetail()
        val repo = FakeOrderRepository(
            detail = base.copy(status = FulfillmentState.READY_FOR_PICKUP, promise = base.promise.copy(courierPickup = pickup())),
        )
        val vm = OrdersViewModel(
            ListFulfillments(repo), GetFulfillment(repo), AdvanceFulfillment(repo), RecordItemProgress(repo),
            coroutineScope = this, handOverToCourier = HandOverToCourier(repo),
        )
        runCurrent()
        vm.selectOrder("f1")
        runCurrent()
        vm.requestCourierHandover()
        runCurrent()
        assertEquals(1, repo.handoverCalls)
        assertEquals(FulfillmentState.COLLECTED, vm.state.value.detail?.status)
        assertEquals(CourierPickupState.HANDED_OVER, vm.state.value.detail?.promise?.courierPickup?.state)
    }

    @Test
    fun a_refused_handover_is_said_and_never_retried() = runTest {
        val base = sampleDetail()
        val repo = FakeOrderRepository(
            detail = base.copy(status = FulfillmentState.READY_FOR_PICKUP, promise = base.promise.copy(courierPickup = pickup())),
        ).apply { failHandoverWith = AppError.Conflict }
        val vm = OrdersViewModel(
            ListFulfillments(repo), GetFulfillment(repo), AdvanceFulfillment(repo), RecordItemProgress(repo),
            coroutineScope = this, handOverToCourier = HandOverToCourier(repo),
        )
        runCurrent()
        vm.selectOrder("f1")
        runCurrent()
        vm.requestCourierHandover()
        runCurrent()
        assertEquals(1, repo.handoverCalls)
        assertNotNull(vm.state.value.message)
    }
}
