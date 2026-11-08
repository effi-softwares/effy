package com.effyshopping.driver.mobile.features.inbox.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.driver.mobile.core.observability.AnalyticsEvent
import com.effyshopping.driver.mobile.features.inbox.domain.InboxActions
import com.effyshopping.driver.mobile.features.inbox.domain.InboxItem
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** The driver's inbox (110 US3). Immutable state; nothing here navigates - a tap returns the item to the shell. */
data class InboxUiState(
    val loading: Boolean = true,
    val loadFailed: Boolean = false,
    val pinned: List<InboxItem> = emptyList(),
    val items: List<InboxItem> = emptyList(),
    val nextCursor: String? = null,
    val loadingMore: Boolean = false,
    val unreadOnly: Boolean = false,
) {
    val anyUnread: Boolean get() = pinned.any { !it.read } || items.any { !it.read }
    val empty: Boolean get() = !loading && !loadFailed && pinned.isEmpty() && items.isEmpty()
}

data class ArchivedItem(val item: InboxItem, val pinned: Boolean, val index: Int)

class InboxViewModel(
    private val inbox: InboxActions,
    liveChanges: Flow<Unit>,
    private val onCount: (Int) -> Unit,
    private val track: (AnalyticsEvent) -> Unit,
    private val clearAppBadge: () -> Unit = {},
) : ViewModel() {

    private val _state = MutableStateFlow(InboxUiState())
    val state: StateFlow<InboxUiState> = _state.asStateFlow()
    private var opened = false

    init {
        load()
        viewModelScope.launch { liveChanges.collect { readFirstPage() } }
    }

    fun load() {
        _state.value = _state.value.copy(loading = true, loadFailed = false)
        viewModelScope.launch { if (!readFirstPage()) _state.value = _state.value.copy(loading = false, loadFailed = true) }
    }

    private suspend fun readFirstPage(): Boolean = try {
        val s = _state.value
        val page = inbox.page(s.unreadOnly)
        _state.value = s.copy(loading = false, loadFailed = false, pinned = page.pinned, items = page.items, nextCursor = page.nextCursor)
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

    private suspend fun markSeen() {
        val newest = newest() ?: run { clearAppBadge(); return }
        try {
            onCount(inbox.markSeen(newest))
            clearAppBadge()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Throwable) {
        }
    }

    private fun newest(): String? = (_state.value.pinned + _state.value.items).maxOfOrNull { it.createdAt }

    fun loadMore() {
        val s = _state.value
        val cursor = s.nextCursor ?: return
        if (s.loadingMore) return
        _state.value = s.copy(loadingMore = true)
        viewModelScope.launch {
            try {
                val page = inbox.page(s.unreadOnly, cursor)
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

    fun showUnreadOnly(unread: Boolean) {
        if (_state.value.unreadOnly == unread) return
        _state.value = _state.value.copy(unreadOnly = unread, loading = true, pinned = emptyList(), items = emptyList(), nextCursor = null)
        viewModelScope.launch { if (!readFirstPage()) _state.value = _state.value.copy(loading = false, loadFailed = true) }
    }

    fun opened(item: InboxItem) {
        markLocallyRead(item.id)
        track(AnalyticsEvent.InboxItemOpened(item.type, item.category, fallback = item.destination == null))
        viewModelScope.launch { inbox.markRead(item.id) }
    }

    fun archive(item: InboxItem): ArchivedItem? {
        val s = _state.value
        val pinnedAt = s.pinned.indexOfFirst { it.id == item.id }
        val listAt = s.items.indexOfFirst { it.id == item.id }
        val archived = when {
            pinnedAt >= 0 -> ArchivedItem(item, true, pinnedAt)
            listAt >= 0 -> ArchivedItem(item, false, listAt)
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
                putBack(archived)
            }
        }
        return archived
    }

    fun undo(archived: ArchivedItem) {
        putBack(archived)
        track(AnalyticsEvent.InboxArchiveUndone(archived.item.type, archived.item.category))
        viewModelScope.launch { runCatching { inbox.restore(archived.item.id) } }
    }

    private fun putBack(a: ArchivedItem) {
        val s = _state.value
        if ((s.pinned + s.items).any { it.id == a.item.id }) return
        _state.value = if (a.pinned) s.copy(pinned = s.pinned.toMutableList().apply { add(a.index.coerceIn(0, size), a.item) })
        else s.copy(items = s.items.toMutableList().apply { add(a.index.coerceIn(0, size), a.item) })
    }

    fun markAllRead() {
        val newest = newest() ?: return
        val s = _state.value
        _state.value = s.copy(pinned = s.pinned.map { it.copy(read = true) }, items = s.items.map { it.copy(read = true) })
        track(AnalyticsEvent.InboxMarkedAllRead)
        viewModelScope.launch {
            try {
                onCount(inbox.readAll(newest))
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                readFirstPage()
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
