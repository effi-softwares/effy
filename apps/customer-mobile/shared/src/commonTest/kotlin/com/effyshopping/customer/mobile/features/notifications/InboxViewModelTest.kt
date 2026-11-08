package com.effyshopping.customer.mobile.features.notifications

import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.observability.AnalyticsEvent
import com.effyshopping.customer.mobile.core.push.CustomerDestination
import com.effyshopping.customer.mobile.features.notifications.domain.InboxActions
import com.effyshopping.customer.mobile.features.notifications.domain.InboxFilter
import com.effyshopping.customer.mobile.features.notifications.domain.InboxItem
import com.effyshopping.customer.mobile.features.notifications.domain.InboxPage
import com.effyshopping.customer.mobile.features.notifications.domain.InboxRepository
import com.effyshopping.customer.mobile.features.notifications.presentation.InboxViewModel
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

/** The inbox's ViewModel (110): open → seen, tap → read, archive and undo, mark all read, live re-read, chips. */
@OptIn(ExperimentalCoroutinesApi::class)
class InboxViewModelTest {

    @BeforeTest fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @AfterTest fun tearDown() = Dispatchers.resetMain()

    private class FakeRepo : InboxRepository {
        var pinned = listOf(item("pin", "2026-11-08T09:00:00.000003Z", important = true))
        var items = listOf(item("b", "2026-11-08T08:00:00.000002Z"), item("a", "2026-11-07T08:00:00.000001Z", read = true))
        var categories = listOf("orders", "points")
        var fail = false
        val calls = mutableListOf<String>()
        var pages = 0
        override suspend fun page(filter: InboxFilter, category: String?, cursor: String?): InboxPage {
            if (fail) throw AppException(AppError.Network)
            pages++
            calls += "page:${filter.wire}:${category ?: "-"}:${cursor ?: "-"}"
            return if (cursor == null) InboxPage(pinned, items, nextCursor = "c1", categories = categories, unseenCount = 2)
            else InboxPage(emptyList(), listOf(item("old", "2026-10-01T08:00:00.000000Z")), nextCursor = null, categories = null, unseenCount = 2)
        }
        override suspend fun unseenCount() = 2
        override suspend fun markSeen(before: String): Int { calls += "seen:$before"; return 0 }
        override suspend fun readAll(before: String): Int { calls += "readAll:$before"; return 0 }
        override suspend fun setArchived(id: String, archived: Boolean) { calls += "archived:$id:$archived" }
        override suspend fun markRead(id: String) { calls += "read:$id" }
    }

    private companion object {
        fun item(id: String, at: String, read: Boolean = false, important: Boolean = false, destination: CustomerDestination? = CustomerDestination.Orders) =
            InboxItem(id, "order_paid", "orders", important, "Order confirmed", "We've received your order.", destination, at, read, null)
    }

    private val counts = mutableListOf<Int>()
    private val events = mutableListOf<AnalyticsEvent>()
    private var badgeCleared = 0

    private fun vm(repo: FakeRepo, live: MutableSharedFlow<Unit> = MutableSharedFlow()) =
        InboxViewModel(InboxActions(repo), live, onCount = { counts += it }, track = { events += it }, clearAppBadge = { badgeCleared++ })

    @Test
    fun opening_shows_the_inbox_and_marks_it_seen_up_to_the_newest_item_shown() {
        val repo = FakeRepo()
        val state = vm(repo).state.value
        assertEquals(listOf("pin"), state.pinned.map { it.id })
        assertEquals(listOf("b", "a"), state.items.map { it.id })
        assertTrue("seen:2026-11-08T09:00:00.000003Z" in repo.calls)
        assertEquals(0, counts.last())
        assertEquals(1, badgeCleared)
        assertTrue(events.any { it.name == "inbox_opened" })
    }

    @Test
    fun only_the_categories_the_shopper_has_are_offered() {
        assertEquals(listOf("orders", "points"), vm(FakeRepo()).state.value.chips.map { it.key })
    }

    @Test
    fun a_tap_reads_the_item_on_screen_and_records_it() {
        val repo = FakeRepo()
        val vm = vm(repo)
        vm.opened(vm.state.value.items.first())
        assertTrue(vm.state.value.items.first().read)
        assertTrue("read:b" in repo.calls)
        assertTrue(events.any { it.name == "inbox_item_opened" && it.props["fallback"] == "false" })
    }

    @Test
    fun archive_then_undo_puts_it_back_where_and_as_it_was() {
        val repo = FakeRepo()
        val vm = vm(repo)
        val first = vm.state.value.items.first()
        val archived = vm.archive(first)!!
        assertEquals(listOf("a"), vm.state.value.items.map { it.id })
        vm.undo(archived)
        assertEquals(listOf("b", "a"), vm.state.value.items.map { it.id })
        assertFalse(vm.state.value.items.first().read)
        assertEquals(listOf("archived:b:true", "archived:b:false"), repo.calls.filter { it.startsWith("archived") })
    }

    @Test
    fun mark_all_read_reads_everything_up_to_the_newest_item() {
        val repo = FakeRepo()
        val vm = vm(repo)
        vm.markAllRead()
        assertFalse(vm.state.value.anyUnread)
        assertTrue("readAll:2026-11-08T09:00:00.000003Z" in repo.calls)
    }

    @Test
    fun a_live_update_re_reads_without_blanking_the_screen() {
        val repo = FakeRepo()
        val live = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
        val vm = vm(repo, live)
        repo.items = listOf(item("c", "2026-11-08T10:00:00.000000Z")) + repo.items
        live.tryEmit(Unit)
        assertEquals(listOf("c", "b", "a"), vm.state.value.items.map { it.id })
        assertFalse(vm.state.value.loading)
    }

    @Test
    fun more_items_load_at_the_end_without_repeats() {
        val repo = FakeRepo()
        val vm = vm(repo)
        vm.loadMore()
        assertEquals(listOf("b", "a", "old"), vm.state.value.items.map { it.id })
        assertEquals(null, vm.state.value.nextCursor)
    }

    @Test
    fun a_filter_reads_again_with_it() {
        val repo = FakeRepo()
        val vm = vm(repo)
        vm.selectFilter(InboxFilter.UNREAD)
        vm.selectCategory("points")
        assertTrue("page:unread:-:-" in repo.calls)
        assertTrue("page:all:points:-" in repo.calls)
    }

    @Test
    fun a_failed_first_read_says_so_and_never_shows_an_empty_inbox() {
        val repo = FakeRepo().apply { fail = true }
        val state = vm(repo).state.value
        assertTrue(state.loadFailed)
        assertFalse(state.empty)
    }
}
