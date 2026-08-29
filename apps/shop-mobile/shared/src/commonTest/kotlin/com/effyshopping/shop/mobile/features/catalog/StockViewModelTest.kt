package com.effyshopping.shop.mobile.features.catalog

import com.effyshopping.shop.mobile.core.error.AppError
import com.effyshopping.shop.mobile.core.error.AppException
import com.effyshopping.shop.mobile.features.catalog.domain.AdjustStock
import com.effyshopping.shop.mobile.features.catalog.domain.GetProductStock
import com.effyshopping.shop.mobile.features.catalog.domain.ProductStock
import com.effyshopping.shop.mobile.features.catalog.domain.ProductStockDetail
import com.effyshopping.shop.mobile.features.catalog.domain.SetStockCount
import com.effyshopping.shop.mobile.features.catalog.domain.SetStockThreshold
import com.effyshopping.shop.mobile.features.catalog.domain.SetStockTracking
import com.effyshopping.shop.mobile.features.catalog.domain.StockReason
import com.effyshopping.shop.mobile.features.catalog.domain.StockRepository
import com.effyshopping.shop.mobile.features.catalog.presentation.StockChangeMode
import com.effyshopping.shop.mobile.features.catalog.presentation.StockViewModel
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

// ⚠ NO COMMAS IN BACKTICK TEST NAMES. Kotlin/Native forbids them in a declaration name while the JVM
// accepts them, so a comma here compiles green on Android and breaks the iOS test compilation
// entirely — which is exactly how 033's iOS suite went unbuilt for a whole slice without anyone
// noticing. Use dashes.

private fun stock(
    tracked: Boolean = true,
    onHand: Int? = 5,
    threshold: Int? = null,
    effective: Int? = null,
    out: Boolean = false,
    low: Boolean = false,
) = ProductStock("p1", tracked, onHand, threshold, effective, out, low)

private class FakeStockRepo(
    var next: ProductStockDetail = ProductStockDetail(stock(), emptyList()),
    var failWith: AppError? = null,
) : StockRepository {
    var lastTracking: Pair<Boolean, Int?>? = null
    var lastSet: Pair<Int, StockReason>? = null
    var lastAdjust: Pair<Int, StockReason>? = null
    var lastThreshold: Int? = null
    var thresholdCalls = 0

    private fun result(): ProductStockDetail {
        failWith?.let { throw AppException(it) }
        return next
    }

    override suspend fun getStock(productId: String) = result()

    override suspend fun setCount(productId: String, onHand: Int, reason: StockReason, note: String?) =
        result().also { lastSet = onHand to reason }

    override suspend fun adjust(productId: String, delta: Int, reason: StockReason, note: String?) =
        result().also { lastAdjust = delta to reason }

    override suspend fun setTracking(productId: String, tracked: Boolean, onHand: Int?) =
        result().also { lastTracking = tracked to onHand }

    override suspend fun setThreshold(productId: String, threshold: Int?) =
        result().also { lastThreshold = threshold; thresholdCalls++ }

    // 054 US5. Not exercised here — LowStockViewModelTest covers the restock list.
    override suspend fun lowStock(): List<com.effyshopping.shop.mobile.features.catalog.domain.LowStockItem> =
        emptyList()
}

private fun viewModel(repo: FakeStockRepo, scope: TestScope) = StockViewModel(
    GetProductStock(repo),
    SetStockCount(repo),
    AdjustStock(repo),
    SetStockTracking(repo),
    SetStockThreshold(repo),
    coroutineScope = scope,
)

class StockViewModelTest {

    @Test
    fun `loading a product publishes its stock and history`() = runTest {
        val repo = FakeStockRepo(ProductStockDetail(stock(onHand = 12), emptyList()))
        val vm = viewModel(repo, this)
        vm.load("p1")
        testScheduler.advanceUntilIdle()

        assertEquals(12, vm.state.value.stock?.onHand)
        assertFalse(vm.state.value.isLoading)
    }

    // ⚠ FR-003. Enabling tracking without a count would make the product instantly unbuyable with no
    // operator intent behind it — a state the shop would hear about from a customer rather than from
    // their own action. The database makes it unrepresentable and the service refuses it; this stops
    // the round trip ever being made.
    @Test
    fun `tracking cannot be enabled until an opening count is entered`() = runTest {
        val repo = FakeStockRepo(ProductStockDetail(stock(tracked = false, onHand = null), emptyList()))
        val vm = viewModel(repo, this)
        vm.load("p1")
        testScheduler.advanceUntilIdle()

        assertFalse(vm.state.value.canEnableTracking)
        vm.setOpeningCount("12")
        assertTrue(vm.state.value.canEnableTracking)
    }

    @Test
    fun `enabling tracking sends the opening count with it`() = runTest {
        val repo = FakeStockRepo(ProductStockDetail(stock(tracked = false, onHand = null), emptyList()))
        val vm = viewModel(repo, this)
        vm.load("p1")
        vm.setOpeningCount("12")
        vm.enableTracking()
        testScheduler.advanceUntilIdle()

        assertEquals(true to 12, repo.lastTracking)
    }

    @Test
    fun `a non-numeric opening count never reaches the backend`() = runTest {
        val repo = FakeStockRepo(ProductStockDetail(stock(tracked = false, onHand = null), emptyList()))
        val vm = viewModel(repo, this)
        vm.load("p1")
        vm.setOpeningCount("twelve")
        vm.enableTracking()
        testScheduler.advanceUntilIdle()

        assertNull(repo.lastTracking)
    }

    @Test
    fun `a relative change is sent as an adjustment - not as an absolute count`() = runTest {
        val repo = FakeStockRepo()
        val vm = viewModel(repo, this)
        vm.load("p1")
        vm.setMode(StockChangeMode.ADJUST)
        vm.setAmount("24")
        vm.setReason(StockReason.RECEIVED)
        vm.submitAmount()
        testScheduler.advanceUntilIdle()

        assertEquals(24 to StockReason.RECEIVED, repo.lastAdjust)
        // Absolute and relative are different operations - not two spellings of one.
        assertNull(repo.lastSet)
    }

    @Test
    fun `an absolute count is sent as a set - not as an adjustment`() = runTest {
        val repo = FakeStockRepo()
        val vm = viewModel(repo, this)
        vm.load("p1")
        vm.setMode(StockChangeMode.SET)
        vm.setAmount("40")
        vm.setReason(StockReason.CORRECTION)
        vm.submitAmount()
        testScheduler.advanceUntilIdle()

        assertEquals(40 to StockReason.CORRECTION, repo.lastSet)
        assertNull(repo.lastAdjust)
    }

    @Test
    fun `a negative change is allowed because breakage and expiry are reductions`() = runTest {
        val repo = FakeStockRepo()
        val vm = viewModel(repo, this)
        vm.load("p1")
        vm.setAmount("-3")
        vm.setReason(StockReason.DAMAGE)
        assertTrue(vm.state.value.canSubmitAmount)
        vm.submitAmount()
        testScheduler.advanceUntilIdle()

        assertEquals(-3 to StockReason.DAMAGE, repo.lastAdjust)
    }

    // A movement that moves nothing is a record with no fact behind it - it would dilute the history
    // the shop reads to understand what happened.
    @Test
    fun `a zero adjustment cannot be submitted`() = runTest {
        val repo = FakeStockRepo()
        val vm = viewModel(repo, this)
        vm.load("p1")
        vm.setAmount("0")
        assertFalse(vm.state.value.canSubmitAmount)
    }

    @Test
    fun `an absolute count of zero IS submittable - emptying a shelf is a real event`() = runTest {
        val repo = FakeStockRepo()
        val vm = viewModel(repo, this)
        vm.load("p1")
        vm.setMode(StockChangeMode.SET)
        vm.setAmount("0")
        assertTrue(vm.state.value.canSubmitAmount)
    }

    // ⚠ Blank means "I have no opinion - use the shop default". Zero would mean "warn me at zero",
    // which is a different instruction and would make the product permanently low.
    @Test
    fun `clearing the threshold sends null rather than zero`() = runTest {
        val repo = FakeStockRepo(ProductStockDetail(stock(threshold = 20, effective = 20), emptyList()))
        val vm = viewModel(repo, this)
        vm.load("p1")
        vm.clearThreshold()
        testScheduler.advanceUntilIdle()

        assertNull(repo.lastThreshold)
        assertEquals(1, repo.thresholdCalls)
    }

    @Test
    fun `a non-numeric threshold is refused locally and never sent`() = runTest {
        val repo = FakeStockRepo()
        val vm = viewModel(repo, this)
        vm.load("p1")
        vm.setThresholdInput("lots")
        vm.submitThreshold()
        testScheduler.advanceUntilIdle()

        assertEquals(0, repo.thresholdCalls)
        assertNotNull(vm.state.value.message)
    }

    // ⚠ The view never sees an AppError. A conflict means "not tracked", and telling the operator to
    // turn tracking on is the only thing that gets them unstuck.
    @Test
    fun `a conflict is explained as untracked stock rather than a generic failure`() = runTest {
        val repo = FakeStockRepo(failWith = AppError.Conflict)
        val vm = viewModel(repo, this)
        vm.load("p1")
        testScheduler.advanceUntilIdle()

        assertEquals(
            "Stock is not being tracked for this product. Turn tracking on first.",
            vm.state.value.message,
        )
    }

    // Forbidden covers "another shop's product" too - the backend answers both with one code so the
    // route cannot be used to discover which product ids exist (FR-004).
    @Test
    fun `a refusal is mapped to copy the operator can act on`() = runTest {
        val repo = FakeStockRepo(failWith = AppError.Forbidden)
        val vm = viewModel(repo, this)
        vm.load("p1")
        testScheduler.advanceUntilIdle()

        assertEquals(
            "You don't have permission to change stock for this product.",
            vm.state.value.message,
        )
        assertFalse(vm.state.value.isLoading)
    }

    @Test
    fun `a successful save clears the draft input so the next change starts clean`() = runTest {
        val repo = FakeStockRepo()
        val vm = viewModel(repo, this)
        vm.load("p1")
        vm.setAmount("24")
        vm.submitAmount()
        testScheduler.advanceUntilIdle()

        assertEquals("", vm.state.value.amount)
        assertNull(vm.state.value.message)
    }
}
