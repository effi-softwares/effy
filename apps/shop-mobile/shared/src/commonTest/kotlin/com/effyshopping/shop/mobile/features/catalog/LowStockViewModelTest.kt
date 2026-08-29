package com.effyshopping.shop.mobile.features.catalog

import com.effyshopping.shop.mobile.core.error.AppError
import com.effyshopping.shop.mobile.core.error.AppException
import com.effyshopping.shop.mobile.features.catalog.domain.GetLowStock
import com.effyshopping.shop.mobile.features.catalog.domain.LowStockItem
import com.effyshopping.shop.mobile.features.catalog.domain.ProductStockDetail
import com.effyshopping.shop.mobile.features.catalog.domain.StockReason
import com.effyshopping.shop.mobile.features.catalog.domain.StockRepository
import com.effyshopping.shop.mobile.features.catalog.presentation.LowStockViewModel
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

// ⚠ NO COMMAS IN BACKTICK TEST NAMES — Kotlin/Native forbids them while the JVM accepts them, so a
// comma compiles green on Android and breaks the iOS test compilation entirely (033's lesson).

private class FakeLowStockRepo(
    var items: List<LowStockItem> = emptyList(),
    var failWith: AppError? = null,
) : StockRepository {
    override suspend fun getStock(productId: String) = error("not used")
    override suspend fun setCount(productId: String, onHand: Int, reason: StockReason, note: String?): ProductStockDetail = error("not used")
    override suspend fun adjust(productId: String, delta: Int, reason: StockReason, note: String?): ProductStockDetail = error("not used")
    override suspend fun setTracking(productId: String, tracked: Boolean, onHand: Int?): ProductStockDetail = error("not used")
    override suspend fun setThreshold(productId: String, threshold: Int?): ProductStockDetail = error("not used")

    override suspend fun lowStock(): List<LowStockItem> {
        failWith?.let { throw AppException(it) }
        return items
    }
}

private fun item(id: String, name: String, onHand: Int, out: Boolean) =
    LowStockItem(id, name, null, onHand, 5, out)

class LowStockViewModelTest {

    @Test
    fun `the list is published in the order the server sent it`() = runTest {
        // ⚠ The server sorts out-of-stock first. Re-sorting here would be a SECOND implementation of
        // an ordering rule the SQL already owns — the class of drift FR-012 exists to prevent.
        val repo = FakeLowStockRepo(
            listOf(item("p1", "Milk", 0, true), item("p2", "Bread", 3, false)),
        )
        val vm = LowStockViewModel(GetLowStock(repo), this)
        testScheduler.advanceUntilIdle()

        assertEquals(listOf("p1", "p2"), vm.state.value.items.map { it.productId })
        assertFalse(vm.state.value.isLoading)
    }

    @Test
    fun `out-of-stock items are counted separately from low ones`() = runTest {
        val repo = FakeLowStockRepo(
            listOf(item("p1", "Milk", 0, true), item("p2", "Bread", 3, false), item("p3", "Eggs", 0, true)),
        )
        val vm = LowStockViewModel(GetLowStock(repo), this)
        testScheduler.advanceUntilIdle()

        // An empty shelf and a thin one are different problems needing different actions.
        assertEquals(2, vm.state.value.outOfStockCount)
    }

    @Test
    fun `an empty list is a real state and not an error`() = runTest {
        val vm = LowStockViewModel(GetLowStock(FakeLowStockRepo()), this)
        testScheduler.advanceUntilIdle()

        assertTrue(vm.state.value.items.isEmpty())
        assertFalse(vm.state.value.isLoading)
        assertEquals(null, vm.state.value.message)
    }

    @Test
    fun `a refusal is mapped to copy the operator can act on`() = runTest {
        val vm = LowStockViewModel(GetLowStock(FakeLowStockRepo(failWith = AppError.Network)), this)
        testScheduler.advanceUntilIdle()

        assertNotNull(vm.state.value.message)
        assertFalse(vm.state.value.isLoading)
    }

    @Test
    fun `refreshing clears a previous refusal rather than stacking messages`() = runTest {
        val repo = FakeLowStockRepo(failWith = AppError.Network)
        val vm = LowStockViewModel(GetLowStock(repo), this)
        testScheduler.advanceUntilIdle()
        assertNotNull(vm.state.value.message)

        repo.failWith = null
        repo.items = listOf(item("p1", "Milk", 0, true))
        vm.refresh()
        testScheduler.advanceUntilIdle()

        assertEquals(null, vm.state.value.message)
        assertEquals(1, vm.state.value.items.size)
    }
}
