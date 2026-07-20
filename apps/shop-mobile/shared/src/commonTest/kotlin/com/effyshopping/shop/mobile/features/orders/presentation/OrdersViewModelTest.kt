package com.effyshopping.shop.mobile.features.orders.presentation

import com.effyshopping.shop.mobile.core.error.AppError
import com.effyshopping.shop.mobile.features.orders.FakeOrderRepository
import com.effyshopping.shop.mobile.features.orders.domain.AdvanceFulfillment
import com.effyshopping.shop.mobile.features.orders.domain.FulfillmentState
import com.effyshopping.shop.mobile.features.orders.domain.FulfillmentTransition
import com.effyshopping.shop.mobile.features.orders.domain.GetFulfillment
import com.effyshopping.shop.mobile.features.orders.domain.ListFulfillments
import com.effyshopping.shop.mobile.features.orders.domain.QueueState
import com.effyshopping.shop.mobile.features.orders.domain.RecordItemProgress
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class OrdersViewModelTest {

    private fun viewModel(repo: FakeOrderRepository, scope: CoroutineScope, initialOrderId: String? = null) =
        OrdersViewModel(
            listFulfillments = ListFulfillments(repo),
            getFulfillment = GetFulfillment(repo),
            advanceFulfillment = AdvanceFulfillment(repo),
            recordItemProgress = RecordItemProgress(repo),
            initialOrderId = initialOrderId,
            coroutineScope = scope,
        )

    @Test
    fun initial_load_populates_the_active_queue_without_opening_any_portion() = runTest {
        val repo = FakeOrderRepository()
        val vm = viewModel(repo, this)

        runCurrent()

        assertEquals(1, vm.state.value.orders.size)
        assertEquals("EFY-10023", vm.state.value.orders.first().orderNumber)
        assertEquals(QueueState.ACTIVE, repo.lastState)
        // Reading a portion ACKNOWLEDGES it (FR-011a) — nothing may be opened without a human tap, so the
        // queue load must not have touched the detail endpoint.
        assertEquals(0, repo.detailCalls)
        assertNull(vm.state.value.detail)
    }

    @Test
    fun selecting_a_portion_loads_its_detail() = runTest {
        val repo = FakeOrderRepository()
        val vm = viewModel(repo, this)
        runCurrent()

        vm.selectOrder("f1")
        runCurrent()

        assertEquals("f1", repo.lastDetailId)
        assertEquals("f1", vm.state.value.selectedId)
        assertEquals(2, vm.state.value.detail?.items?.size)
        assertEquals(false, vm.state.value.isLoadingDetail)
    }

    @Test
    fun requesting_a_transition_calls_the_advance_use_case_with_the_requested_state() = runTest {
        val repo = FakeOrderRepository()
        val vm = viewModel(repo, this)
        runCurrent()
        vm.selectOrder("f1")
        runCurrent()

        vm.requestTransition(FulfillmentTransition.READY_FOR_PICKUP)
        runCurrent()

        assertEquals(FulfillmentTransition.READY_FOR_PICKUP, repo.lastTransition)
        assertEquals(FulfillmentState.READY_FOR_PICKUP, vm.state.value.detail?.status)
        assertEquals(false, vm.state.value.isWorking)
    }

    @Test
    fun reversing_a_ready_portion_requests_picking_again() = runTest {
        val repo = FakeOrderRepository(detail = com.effyshopping.shop.mobile.features.orders.sampleDetail(status = FulfillmentState.READY_FOR_PICKUP))
        val vm = viewModel(repo, this)
        runCurrent()
        vm.selectOrder("f1")
        runCurrent()

        assertEquals(true, vm.state.value.detail?.canReverse)
        vm.requestTransition(FulfillmentTransition.PICKING)
        runCurrent()

        assertEquals(FulfillmentTransition.PICKING, repo.lastTransition)
    }

    @Test
    fun recording_item_progress_sends_absolute_quantities_not_deltas() = runTest {
        val repo = FakeOrderRepository()
        val vm = viewModel(repo, this)
        runCurrent()
        vm.selectOrder("f1")
        runCurrent()

        // The line already has 1 of 2 gathered; the operator gathers the second, so the ABSOLUTE 2 is sent.
        vm.recordProgress(orderItemId = "oi-1", gatheredQuantity = 2)
        runCurrent()

        assertEquals("oi-1", repo.lastProgressItemId)
        assertEquals(2, repo.lastProgress?.gatheredQuantity)
        assertNull(repo.lastProgress?.unavailableQuantity)
        assertEquals(2, vm.state.value.detail?.items?.first()?.gatheredQuantity)
    }

    @Test
    fun un_flagging_an_item_sends_an_absolute_zero() = runTest {
        val repo = FakeOrderRepository()
        val vm = viewModel(repo, this)
        runCurrent()
        vm.selectOrder("f1")
        runCurrent()

        vm.recordProgress(orderItemId = "oi-2", unavailableQuantity = 1)
        runCurrent()
        assertEquals(1, repo.lastProgress?.unavailableQuantity)

        // Found after all (FR-010d) — the same call, with an absolute zero.
        vm.recordProgress(orderItemId = "oi-2", unavailableQuantity = 0)
        runCurrent()

        assertEquals(0, repo.lastProgress?.unavailableQuantity)
        assertEquals(0, vm.state.value.detail?.items?.last()?.unavailableQuantity)
    }

    @Test
    fun a_queue_failure_becomes_a_user_facing_message_rather_than_throwing() = runTest {
        val repo = FakeOrderRepository()
        repo.failListWith = AppError.Network
        val vm = viewModel(repo, this)

        runCurrent()

        val message = vm.state.value.message
        assertNotNull(message)
        assertTrue(message.isNotBlank())
        // The closed AppError set is never leaked verbatim to the shop floor.
        assertTrue(!message.contains("Network"), "message should be human-readable, was: $message")
        assertEquals(false, vm.state.value.isLoadingQueue)
        assertTrue(vm.state.value.orders.isEmpty())
    }

    @Test
    fun a_conflicting_transition_surfaces_a_message_and_re_reads_instead_of_retrying() = runTest {
        val repo = FakeOrderRepository()
        val vm = viewModel(repo, this)
        runCurrent()
        vm.selectOrder("f1")
        runCurrent()

        val detailReadsBefore = repo.detailCalls
        repo.failTransitionWith = AppError.Conflict
        vm.requestTransition(FulfillmentTransition.READY_FOR_PICKUP)
        runCurrent()

        assertNotNull(vm.state.value.message)
        assertEquals(false, vm.state.value.isWorking)
        // Refreshed, never retried: exactly one extra detail read and no second transition attempt.
        assertEquals(detailReadsBefore + 1, repo.detailCalls)
    }

    @Test
    fun switching_to_the_completed_queue_reads_the_completed_slice() = runTest {
        val repo = FakeOrderRepository()
        val vm = viewModel(repo, this)
        runCurrent()

        vm.selectQueue(QueueState.COMPLETED)
        runCurrent()

        assertEquals(QueueState.COMPLETED, repo.lastState)
        assertEquals(QueueState.COMPLETED, vm.state.value.queue)
        assertNull(vm.state.value.selectedId)
    }

    @Test
    fun an_initial_order_id_restored_from_the_nav_route_opens_that_portion() = runTest {
        val repo = FakeOrderRepository()
        val vm = viewModel(repo, this, initialOrderId = "f1")

        runCurrent()

        assertEquals("f1", repo.lastDetailId)
        assertEquals("f1", vm.state.value.selectedId)
        assertNotNull(vm.state.value.detail)
    }
}
