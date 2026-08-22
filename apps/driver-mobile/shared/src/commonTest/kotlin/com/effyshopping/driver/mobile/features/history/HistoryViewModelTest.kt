package com.effyshopping.driver.mobile.features.history

import com.effyshopping.driver.mobile.core.error.AppError
import com.effyshopping.driver.mobile.core.error.AppException
import com.effyshopping.driver.mobile.features.history.domain.GetHistory
import com.effyshopping.driver.mobile.features.history.domain.GetHistoryDetail
import com.effyshopping.driver.mobile.features.history.domain.History
import com.effyshopping.driver.mobile.features.history.domain.HistoryDay
import com.effyshopping.driver.mobile.features.history.domain.HistoryDetail
import com.effyshopping.driver.mobile.features.history.domain.HistoryDropRow
import com.effyshopping.driver.mobile.features.history.domain.HistoryRepository
import com.effyshopping.driver.mobile.features.history.domain.ProofRecord
import com.effyshopping.driver.mobile.features.history.domain.TimelineEntry
import com.effyshopping.driver.mobile.features.history.presentation.HistoryViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

private class FakeHistoryRepo(var history: History = History(emptyList()), var detail: HistoryDetail? = null, var fail: AppError? = null) : HistoryRepository {
    override suspend fun list(): History = fail?.let { throw AppException(it) } ?: history
    override suspend fun detail(kind: String, id: String): HistoryDetail = detail!!
}

class HistoryViewModelTest {
    @BeforeTest fun setup() { Dispatchers.setMain(Dispatchers.Unconfined) }

    private fun vm(repo: FakeHistoryRepo) = HistoryViewModel(GetHistory(repo), GetHistoryDetail(repo))

    @Test fun loads_history_days() = runTest {
        val repo = FakeHistoryRepo(history = History(listOf(
            HistoryDay("2026-08-23", emptyList(), listOf(HistoryDropRow("d1", "EFY-1", "Carlton", "2026-08-23T10:00", true))),
        )))
        val v = vm(repo); v.load()
        assertEquals(1, v.state.value.history?.days?.size)
    }

    @Test fun an_empty_history_is_a_distinct_state() = runTest {
        val v = vm(FakeHistoryRepo(history = History(emptyList()))); v.load()
        assertTrue(v.state.value.isEmpty)
    }

    @Test fun loads_a_detail_with_timeline_and_proof() = runTest {
        val repo = FakeHistoryRepo(detail = HistoryDetail(
            timeline = listOf(TimelineEntry("delivered", "2026-08-23T10:00")),
            proof = ProofRecord("code", null, null, "2026-08-23T10:00"),
            addressFull = "1 St, Carlton",
        ))
        val v = vm(repo); v.loadDetail("drop", "d1")
        assertEquals(1, v.state.value.detail?.timeline?.size)
        assertEquals("code", v.state.value.detail?.proof?.method)
    }

    @Test fun a_network_error_surfaces_a_message() = runTest {
        val v = vm(FakeHistoryRepo(fail = AppError.Network)); v.load()
        assertTrue(v.state.value.message != null)
    }
}
