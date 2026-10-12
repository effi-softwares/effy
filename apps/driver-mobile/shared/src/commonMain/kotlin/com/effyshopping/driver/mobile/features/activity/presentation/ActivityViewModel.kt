package com.effyshopping.driver.mobile.features.activity.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.driver.mobile.core.error.AppException
import com.effyshopping.driver.mobile.core.presentation.userMessage
import com.effyshopping.driver.mobile.features.activity.domain.ActivityItem
import com.effyshopping.driver.mobile.features.activity.domain.ActivitySeen
import com.effyshopping.driver.mobile.features.activity.domain.isNewSince
import com.effyshopping.driver.mobile.features.activity.domain.GetActivity
import com.effyshopping.driver.mobile.features.activity.domain.MarkActivityRead
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ActivityUiState(
    val items: List<ActivityItem> = emptyList(),
    val isLoading: Boolean = false,
    val loaded: Boolean = false,
    val message: String? = null,
) {
    val isEmpty: Boolean get() = loaded && items.isEmpty()
}

class ActivityViewModel(
    private val getActivity: GetActivity,
    private val markRead: MarkActivityRead,
    /** Where "already shown" is kept. Null in tests that do not care which items are new. */
    private val seen: ActivitySeen? = null,
    /** 071 — "your work changed": the feed is about that work, so it re-reads too. */
    private val liveChanges: Flow<Unit> = emptyFlow(),
) : ViewModel() {
    private val _state = MutableStateFlow(ActivityUiState())
    val state = _state.asStateFlow()

    init {
        viewModelScope.launch { liveChanges.collect { if (_state.value.loaded && !_state.value.isLoading) load() } }
    }

    fun load() {
        _state.update { it.copy(isLoading = true, message = null) }
        viewModelScope.launch {
            try {
                val fetched = getActivity()
                // ⚠ The platform sends every item as unread, always — it has nowhere to record a
                // read. What is NEW is judged against what this phone has already shown, and the
                // dots stay for this visit so the driver can see which ones they are.
                val items = seen?.let { store ->
                    val lastSeen = store.lastSeen()
                    fetched.map { it.copy(read = !it.isNewSince(lastSeen)) }
                } ?: fetched
                _state.update { it.copy(items = items, isLoading = false, loaded = true) }
                fetched.maxOfOrNull { it.createdAt }?.let { newest -> seen?.markSeen(newest) }
                val unread = items.filter { !it.read }.map { it.id }
                if (unread.isNotEmpty()) runCatching { markRead(unread) }
            } catch (e: AppException) {
                _state.update { it.copy(isLoading = false, loaded = true, message = e.error.userMessage()) }
            }
        }
    }
}
