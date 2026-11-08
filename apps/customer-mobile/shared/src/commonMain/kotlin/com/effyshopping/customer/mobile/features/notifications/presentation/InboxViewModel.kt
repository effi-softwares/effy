package com.effyshopping.customer.mobile.features.notifications.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.customer.mobile.core.observability.AnalyticsEvent
import com.effyshopping.customer.mobile.features.notifications.domain.InboxActions
import com.effyshopping.customer.mobile.features.notifications.domain.InboxCategories
import com.effyshopping.customer.mobile.features.notifications.domain.InboxCategoryInfo
import com.effyshopping.customer.mobile.features.notifications.domain.InboxFilter
import com.effyshopping.customer.mobile.features.notifications.domain.InboxItem
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * The inbox (110) - `ViewModel → UseCase → Repository`. Immutable state; the screen draws it and calls these
 * functions. Nothing here navigates: a tap returns the item, and the shell routes it with 109's router.
 */
data class InboxUiState(
    val loading: Boolean = true,
    val loadFailed: Boolean = false,
    val pinned: List<InboxItem> = emptyList(),
    val items: List<InboxItem> = emptyList(),
    val nextCursor: String? = null,
    val loadingMore: Boolean = false,
    val filter: InboxFilter = InboxFilter.ALL,
    val category: String? = null,
    /** The categories the shopper has items in - the chips after All and Unread. */
    val chips: List<InboxCategoryInfo> = emptyList(),
) {
    val anyUnread: Boolean get() = pinned.any { !it.read } || items.any { !it.read }
    val empty: Boolean get() = !loading && !loadFailed && pinned.isEmpty() && items.isEmpty()
    /** An empty list because of a filter (offer a way back), not because nothing was ever said. */
    val filtered: Boolean get() = filter != InboxFilter.ALL || category != null
}

/** An archive that can still be undone: the item and where it was. */
data class ArchivedItem(val item: InboxItem, val pinned: Boolean, val index: Int)

class InboxViewModel(
    private val inbox: InboxActions,
    /** "your inbox changed, or the channel just (re)connected: read now". */
    liveChanges: Flow<Unit>,
    /** The bell takes the count an action answered, so it changes at once. */
    private val onCount: (Int) -> Unit,
    private val track: (AnalyticsEvent) -> Unit,
    /** Clears the phone's app-icon badge once the inbox has been seen (R8). */
    private val clearAppBadge: () -> Unit = {},
) : ViewModel() {

    private val _state = MutableStateFlow(InboxUiState())
    val state: StateFlow<InboxUiState> = _state.asStateFlow()
    private var opened = false

    init {
        load()
        viewModelScope.launch { liveChanges.collect { refresh() } }
    }

    fun load() {
        _state.value = _state.value.copy(loading = true, loadFailed = false)
        viewModelScope.launch {
            if (!readFirstPage()) _state.value = _state.value.copy(loading = false, loadFailed = true)
        }
    }

    /** Re-read the first page without clearing the screen (a live update). A failure keeps what is shown. */
    suspend fun refresh() {
        readFirstPage()
    }

    private suspend fun readFirstPage(): Boolean = try {
        val s = _state.value
        val page = inbox.page(s.filter, s.category)
        _state.value = s.copy(
            loading = false,
            loadFailed = false,
            pinned = page.pinned,
            items = page.items,
            nextCursor = page.nextCursor,
            chips = page.categories?.let { InboxCategories.chipsFor(it) } ?: s.chips,
        )
        onCount(page.unseenCount)
        if (!opened) {
            opened = true
            track(AnalyticsEvent.InboxOpened)
            markSeen()
        }
        true
    } catch (e: CancellationException) {
        throw e
    } catch (_: Throwable) {
        false
    }

    /** Opening the inbox clears the bell: everything up to the newest item shown is seen (FR-010). */
    private suspend fun markSeen() {
        val newest = newestCreatedAt() ?: run { clearAppBadge(); return }
        try {
            onCount(inbox.markSeen(newest))
            clearAppBadge()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Throwable) {
            // The bell stays as it was; the next open tries again.
        }
    }

    /** ISO strings with the same precision compare correctly as text. */
    private fun newestCreatedAt(): String? =
        (_state.value.pinned + _state.value.items).maxOfOrNull { it.createdAt }

    fun loadMore() {
        val s = _state.value
        val cursor = s.nextCursor ?: return
        if (s.loadingMore) return
        _state.value = s.copy(loadingMore = true)
        viewModelScope.launch {
            try {
                val page = inbox.page(s.filter, s.category, cursor)
                val now = _state.value
                val known = (now.pinned + now.items).map { it.id }.toSet()
                _state.value = now.copy(loadingMore = false, items = now.items + page.items.filter { it.id !in known }, nextCursor = page.nextCursor)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                _state.value = _state.value.copy(loadingMore = false)
            }
        }
    }

    fun selectFilter(filter: InboxFilter) = reselect(filter, null)

    fun selectCategory(category: String) = reselect(InboxFilter.ALL, category)

    private fun reselect(filter: InboxFilter, category: String?) {
        val s = _state.value
        if (s.filter == filter && s.category == category) return
        _state.value = s.copy(filter = filter, category = category, loading = true, loadFailed = false, pinned = emptyList(), items = emptyList(), nextCursor = null)
        viewModelScope.launch {
            if (!readFirstPage()) _state.value = _state.value.copy(loading = false, loadFailed = true)
        }
    }

    /**
     * A tap (FR-012): the item is read at once on screen and recorded in the background; the caller then opens its
     * destination, or its detail sheet when this build does not know where it leads.
     */
    fun opened(item: InboxItem) {
        markLocallyRead(item.id)
        track(AnalyticsEvent.InboxItemOpened(item.type, item.category, fallback = item.destination == null))
        viewModelScope.launch { inbox.markRead(item.id) }
    }

    /** Swiped away (FR-016). Returns what [undo] needs. */
    fun archive(item: InboxItem): ArchivedItem? {
        val s = _state.value
        val pinnedAt = s.pinned.indexOfFirst { it.id == item.id }
        val listAt = s.items.indexOfFirst { it.id == item.id }
        val archived = when {
            pinnedAt >= 0 -> ArchivedItem(item, pinned = true, index = pinnedAt)
            listAt >= 0 -> ArchivedItem(item, pinned = false, index = listAt)
            else -> return null
        }
        _state.value = s.copy(pinned = s.pinned.filterNot { it.id == item.id }, items = s.items.filterNot { it.id == item.id })
        track(AnalyticsEvent.InboxItemArchived(item.type, item.category))
        viewModelScope.launch {
            try {
                inbox.archive(item.id)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                undoLocally(archived) // It did not happen: put it back.
            }
        }
        return archived
    }

    /** Undo puts it back exactly where and as it was (FR-017). */
    fun undo(archived: ArchivedItem) {
        undoLocally(archived)
        track(AnalyticsEvent.InboxArchiveUndone(archived.item.type, archived.item.category))
        viewModelScope.launch { runCatching { inbox.restore(archived.item.id) } }
    }

    private fun undoLocally(archived: ArchivedItem) {
        val s = _state.value
        if ((s.pinned + s.items).any { it.id == archived.item.id }) return
        _state.value = if (archived.pinned) {
            s.copy(pinned = s.pinned.toMutableList().apply { add(archived.index.coerceIn(0, size), archived.item) })
        } else {
            s.copy(items = s.items.toMutableList().apply { add(archived.index.coerceIn(0, size), archived.item) })
        }
    }

    /** Every item up to the newest shown becomes read - including ones not yet scrolled to (FR-014). */
    fun markAllRead() {
        val newest = newestCreatedAt() ?: return
        val s = _state.value
        _state.value = s.copy(pinned = s.pinned.map { it.copy(read = true) }, items = s.items.map { it.copy(read = true) })
        track(AnalyticsEvent.InboxMarkedAllRead)
        viewModelScope.launch {
            try {
                onCount(inbox.readAll(newest))
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                refresh()
            }
        }
    }

    private fun markLocallyRead(id: String) {
        val s = _state.value
        _state.value = s.copy(
            pinned = s.pinned.map { if (it.id == id) it.copy(read = true) else it },
            items = s.items.map { if (it.id == id) it.copy(read = true) else it },
        )
    }
}
