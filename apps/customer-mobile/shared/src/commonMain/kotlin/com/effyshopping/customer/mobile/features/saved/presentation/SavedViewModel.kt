package com.effyshopping.customer.mobile.features.saved.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.customer.mobile.features.saved.domain.ListSaved
import com.effyshopping.customer.mobile.features.saved.domain.LoadSavedMembership
import com.effyshopping.customer.mobile.features.saved.domain.RemoveSaved
import com.effyshopping.customer.mobile.features.saved.domain.SavedItem
import com.effyshopping.customer.mobile.features.saved.domain.UndoRemoveSaved
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * The saved list's UI state — one immutable observable object, per Principle VI's MVVM rule.
 */
sealed interface SavedUiState {
    data object Loading : SavedUiState
    data class Ready(val items: List<SavedItem>) : SavedUiState
    data object Error : SavedUiState
}

/** A removal the shopper can still undo (FR-017). */
data class PendingUndo(val item: SavedItem, val savedAt: String)

class SavedViewModel(
    private val listSaved: ListSaved,
    private val loadMembership: LoadSavedMembership,
    private val removeSaved: RemoveSaved,
    private val undoRemove: UndoRemoveSaved,
    private val postcode: () -> String?,
) : ViewModel() {

    private val _state = MutableStateFlow<SavedUiState>(SavedUiState.Loading)
    val state: StateFlow<SavedUiState> = _state.asStateFlow()

    private val _undo = MutableStateFlow<PendingUndo?>(null)
    val undo: StateFlow<PendingUndo?> = _undo.asStateFlow()

    init { load() }

    private fun load() {
        viewModelScope.launch {
            _state.value = SavedUiState.Loading
            fetch()
        }
    }

    /**
     * Pull-to-refresh. ⚠ Non-destructive: it does NOT drop back to Loading, so a refresh over a list
     * the shopper is reading does not blank it (the 027 pattern).
     */
    suspend fun refresh() = fetch()

    fun retry() = load()

    private suspend fun fetch() {
        try {
            val items = listSaved(postcode())
            _state.value = SavedUiState.Ready(items)
            // Keep every heart on every other screen in step with what this list just proved.
            runCatching { loadMembership() }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Throwable) {
            _state.value = SavedUiState.Error
        }
    }

    /**
     * Remove an item, optimistically, and offer undo.
     *
     * ⚠ The row disappears immediately and the item is held for undo. Waiting for the platform first
     * would make the list feel stuck on a slow connection.
     */
    fun remove(item: SavedItem) {
        val current = _state.value
        if (current !is SavedUiState.Ready) return
        _state.value = SavedUiState.Ready(current.items.filterNot { it.productId == item.productId })

        viewModelScope.launch {
            try {
                val savedAt = removeSaved(item)
                _undo.value = PendingUndo(item, savedAt)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                _state.value = current // put it back — the platform refused
            }
        }
    }

    /**
     * Undo a removal.
     *
     * ⚠ Restores the item's ORIGINAL saved_at, so it returns to the position it held rather than
     * jumping to the top (FR-018). Undo means "that removal did not happen"; a deliberate re-save
     * later is a different act and correctly goes to the top.
     */
    fun undoRemoval() {
        val pending = _undo.value ?: return
        _undo.value = null
        viewModelScope.launch {
            try {
                undoRemove(pending.item.productId, pending.savedAt)
                fetch() // re-read so the item lands back in its real position
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                // The list is already correct (the item is gone); nothing to roll back.
            }
        }
    }

    fun dismissUndo() { _undo.value = null }
}
