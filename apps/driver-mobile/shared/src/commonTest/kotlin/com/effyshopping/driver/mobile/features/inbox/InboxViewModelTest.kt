package com.effyshopping.driver.mobile.features.inbox

import com.effyshopping.driver.mobile.core.observability.AnalyticsEvent
import com.effyshopping.driver.mobile.core.push.DriverDestination
import com.effyshopping.driver.mobile.features.inbox.domain.InboxActions
import com.effyshopping.driver.mobile.features.inbox.domain.InboxItem
import com.effyshopping.driver.mobile.features.inbox.domain.InboxPage
import com.effyshopping.driver.mobile.features.inbox.domain.InboxRepository
import com.effyshopping.driver.mobile.features.inbox.domain.groupByDay
import com.effyshopping.driver.mobile.features.inbox.presentation.InboxViewModel
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
import kotlin.test.assertTrue

/** The driver inbox (110 US3): the pinned catch-up notice on top, seen on open, archive and undo, unread only. */
@OptIn(ExperimentalCoroutinesApi::class)
class InboxViewModelTest {
    @BeforeTest fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @AfterTest fun tearDown() = Dispatchers.resetMain()

    private class FakeRepo : InboxRepository {
        val calls = mutableListOf<String>()
        override suspend fun page(unreadOnly: Boolean, cursor: String?): InboxPage {
            calls += "page:$unreadOnly"
            return InboxPage(
                pinned = listOf(item("runs", "2026-11-09T08:00:00.000002Z", "driver_runs_today", important = true, destination = DriverDestination.Today)),
                items = listOf(item("r1", "2026-11-09T07:00:00.000001Z", "run_assigned", destination = DriverDestination.Run("r1"))),
                nextCursor = null,
                unseenCount = 2,
            )
        }
        override suspend fun unseenCount() = 2
        override suspend fun markSeen(before: String): Int { calls += "seen:$before"; return 0 }
        override suspend fun readAll(before: String): Int { calls += "readAll:$before"; return 0 }
        override suspend fun setArchived(id: String, archived: Boolean) { calls += "archived:$id:$archived" }
        override suspend fun markRead(id: String) { calls += "read:$id" }
    }

    private companion object {
        fun item(id: String, at: String, type: String, important: Boolean = false, destination: DriverDestination?) =
            InboxItem(id, type, "work", important, "t-$id", "b", destination, at, read = false)
    }

    private val events = mutableListOf<AnalyticsEvent>()
    private fun vm(repo: FakeRepo) = InboxViewModel(InboxActions(repo), MutableSharedFlow(), onCount = {}, track = { events += it })

    @Test
    fun opens_with_the_catch_up_notice_pinned_and_marks_everything_shown_as_seen() {
        val repo = FakeRepo()
        val st = vm(repo).state.value
        assertEquals(listOf("runs"), st.pinned.map { it.id })
        assertEquals(listOf("r1"), st.items.map { it.id })
        assertTrue("seen:2026-11-09T08:00:00.000002Z" in repo.calls)
    }

    @Test
    fun archive_undo_and_tap() {
        val repo = FakeRepo()
        val vm = vm(repo)
        val a = vm.archive(vm.state.value.pinned.first())!!
        assertTrue(vm.state.value.pinned.isEmpty())
        vm.undo(a)
        assertEquals(listOf("runs"), vm.state.value.pinned.map { it.id })
        vm.opened(vm.state.value.items.first())
        assertTrue(vm.state.value.items.first().read)
        assertTrue("read:r1" in repo.calls)
    }

    @Test
    fun unread_only_reads_again_and_mark_all_read_clears_every_dot() {
        val repo = FakeRepo()
        val vm = vm(repo)
        vm.showUnreadOnly(true)
        assertTrue("page:true" in repo.calls)
        vm.markAllRead()
        assertFalse(vm.state.value.anyUnread)
    }

    @Test
    fun groups_by_day() {
        val items = listOf(item("a", "A", "run_assigned", destination = null), item("b", "B", "run_assigned", destination = null), item("c", "C", "run_assigned", destination = null))
        val groups = groupByDay(items, today = "2026-11-09", yesterday = "2026-11-08") { mapOf("A" to "2026-11-09", "B" to "2026-11-08", "C" to "2026-11-01")[it] }
        assertEquals(listOf("Today", "Yesterday", "Earlier"), groups.map { it.heading })
    }
}
