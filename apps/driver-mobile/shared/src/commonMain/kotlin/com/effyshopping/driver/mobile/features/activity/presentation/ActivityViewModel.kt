package com.effyshopping.driver.mobile.features.activity.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.driver.mobile.core.error.AppException
import com.effyshopping.driver.mobile.core.presentation.userMessage
import com.effyshopping.driver.mobile.features.activity.domain.ActivityItem
import com.effyshopping.driver.mobile.features.activity.domain.GetActivity
import com.effyshopping.driver.mobile.features.activity.domain.MarkActivityRead
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
) : ViewModel() {
    private val _state = MutableStateFlow(ActivityUiState())
    val state = _state.asStateFlow()

    fun load() {
        _state.update { it.copy(isLoading = true, message = null) }
        viewModelScope.launch {
            try {
                val items = getActivity()
                _state.update { it.copy(items = items, isLoading = false, loaded = true) }
                // Mark the unread ones read once seen.
                val unread = items.filter { !it.read }.map { it.id }
                if (unread.isNotEmpty()) {
                    runCatching { markRead(unread) }
                        // ⚠ 060: the local state was NEVER updated after this call, so every
                        // unread dot stayed on screen until the driver reloaded the tab — the
                        // server knew they were read and the app kept saying otherwise. That is
                        // also why the design's "Mark all read" button is absent: items are marked
                        // read the moment the screen opens, so the button would do nothing visible,
                        // and a control that does nothing is worse than none (054).
                        .onSuccess {
                            _state.update { st ->
                                st.copy(items = st.items.map { it.copy(read = true) })
                            }
                        }
                }
            } catch (e: AppException) {
                _state.update { it.copy(isLoading = false, loaded = true, message = e.error.userMessage()) }
            }
        }
    }
}
