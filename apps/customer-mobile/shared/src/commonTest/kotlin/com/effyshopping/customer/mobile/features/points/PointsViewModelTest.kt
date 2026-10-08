package com.effyshopping.customer.mobile.features.points

import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.features.points.domain.GetOlderPoints
import com.effyshopping.customer.mobile.features.points.domain.GetPoints
import com.effyshopping.customer.mobile.features.points.domain.PointsBalance
import com.effyshopping.customer.mobile.features.points.domain.PointsHistoryPage
import com.effyshopping.customer.mobile.features.points.domain.PointsLine
import com.effyshopping.customer.mobile.features.points.domain.PointsRepository
import com.effyshopping.customer.mobile.features.points.presentation.PointsViewModel
import com.effyshopping.customer.mobile.features.points.presentation.formatPoints
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * 074 US1 — the Points screen's ViewModel.
 *
 * ⚠ The behaviour a refactor is most likely to "tidy" away: a failed read must NEVER read as a zero
 * balance, and a live update must re-read without blanking the screen.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class PointsViewModelTest {

    @BeforeTest fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @AfterTest fun tearDown() = Dispatchers.resetMain()

    private class FakeRepo : PointsRepository {
        var balance = PointsBalance(points = 1250, valueAmount = "12.50", nextExpiry = null)
        var fail = false
        val pages = mutableMapOf<String?, PointsHistoryPage>(
            null to PointsHistoryPage(listOf(line("2", -300), line("1", 1550)), nextCursor = "c1"),
            "c1" to PointsHistoryPage(listOf(line("0", 100)), nextCursor = null),
        )
        override suspend fun balance(): PointsBalance = if (fail) throw AppException(AppError.Network) else balance
        override suspend fun history(cursor: String?): PointsHistoryPage = if (fail) throw AppException(AppError.Network) else pages.getValue(cursor)
    }

    private companion object {
        fun line(id: String, points: Long) = PointsLine(id = id, points = points, words = "w$id", usableUntil = null, at = "2026-10-08T01:00:00Z")
    }

    private fun vm(repo: FakeRepo, live: MutableSharedFlow<Unit> = MutableSharedFlow()) =
        PointsViewModel(GetPoints(repo), GetOlderPoints(repo), live)

    @Test
    fun shows_the_balance_and_the_first_page() {
        val state = vm(FakeRepo()).state.value
        assertFalse(state.loading)
        assertEquals(1250, state.balance?.points)
        assertEquals(listOf("2", "1"), state.lines.map { it.id })
        assertEquals("c1", state.nextCursor)
    }

    @Test
    fun a_failed_read_is_not_a_zero_balance() {
        val repo = FakeRepo().apply { fail = true }
        val state = vm(repo).state.value
        assertTrue(state.loadFailed)
        assertNull(state.balance)
    }

    @Test
    fun older_lines_are_appended_and_paging_stops() {
        val model = vm(FakeRepo())
        model.loadOlder()
        assertEquals(listOf("2", "1", "0"), model.state.value.lines.map { it.id })
        assertNull(model.state.value.nextCursor)
    }

    @Test
    fun a_live_update_re_reads_and_a_failed_re_read_keeps_the_screen() {
        val repo = FakeRepo()
        val live = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
        val model = vm(repo, live)
        repo.balance = repo.balance.copy(points = 1750)
        live.tryEmit(Unit)
        assertEquals(1750, model.state.value.balance?.points)
        repo.fail = true
        live.tryEmit(Unit)
        assertEquals(1750, model.state.value.balance?.points)
        assertFalse(model.state.value.loadFailed)
    }

    @Test
    fun points_are_grouped_in_thousands() {
        assertEquals("1,250", formatPoints(1250))
        assertEquals("1,000,000", formatPoints(1_000_000))
        assertEquals("12", formatPoints(12))
    }
}
