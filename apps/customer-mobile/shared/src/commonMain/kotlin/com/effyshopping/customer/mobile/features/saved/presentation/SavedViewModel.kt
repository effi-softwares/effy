package com.effyshopping.customer.mobile.features.saved.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.customer.mobile.features.saved.domain.ListSaved
import com.effyshopping.customer.mobile.features.saved.domain.LoadSavedMembership
import com.effyshopping.customer.mobile.features.saved.domain.AddToList
import com.effyshopping.customer.mobile.features.saved.domain.CreateList
import com.effyshopping.customer.mobile.features.saved.domain.DEFAULT_LIST_ID
import com.effyshopping.customer.mobile.features.saved.domain.DeleteList
import com.effyshopping.customer.mobile.features.saved.domain.ListRefusedException
import com.effyshopping.customer.mobile.features.saved.domain.LoadLists
import com.effyshopping.customer.mobile.features.saved.domain.RemoveFromList
import com.effyshopping.customer.mobile.features.saved.domain.RenameList
import com.effyshopping.customer.mobile.features.saved.domain.SavedList
import com.effyshopping.customer.mobile.features.saved.domain.SavedItem
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
data class PendingUndo(val item: SavedItem, val savedAt: String, val listId: String)

/**
 * One of the shopper's lists, on screen (033; 068 made it any list rather than the only one).
 *
 * [selected] is the list being shown: [DEFAULT_LIST_ID] for "Saved", or a named list's id. Everything
 * a row does is scoped to it — a product removed here stays in every other list it is in.
 *
 * [lists] is empty for a guest and when the lists read fails; the screen then shows "Saved" alone,
 * exactly as it did before 068, so a stale backend costs named lists and never saved items.
 */
class SavedViewModel(
    private val listSaved: ListSaved,
    private val loadMembership: LoadSavedMembership,
    private val loadLists: LoadLists,
    private val removeFromList: RemoveFromList,
    private val addToList: AddToList,
    private val createList: CreateList,
    private val renameList: RenameList,
    private val deleteList: DeleteList,
) : ViewModel() {

    private val _state = MutableStateFlow<SavedUiState>(SavedUiState.Loading)
    val state: StateFlow<SavedUiState> = _state.asStateFlow()

    private val _lists = MutableStateFlow<List<SavedList>>(emptyList())
    val lists: StateFlow<List<SavedList>> = _lists.asStateFlow()

    private val _selected = MutableStateFlow(DEFAULT_LIST_ID)
    val selected: StateFlow<String> = _selected.asStateFlow()

    private val _undo = MutableStateFlow<PendingUndo?>(null)
    val undo: StateFlow<PendingUndo?> = _undo.asStateFlow()

    init { load() }

    private fun load() {
        viewModelScope.launch {
            _state.value = SavedUiState.Loading
            fetch()
        }
    }

    /** Pull-to-refresh: re-read WITHOUT clearing what is on screen (FR-068). */
    suspend fun refresh() = fetch()

    fun retry() = load()

    /** Show another list. An undo offered for the previous list is withdrawn with it. */
    fun select(listId: String) {
        if (listId == _selected.value) return
        _selected.value = listId
        _undo.value = null
        load()
    }

    private suspend fun fetch() {
        // The tab row first, and never fatal: a failure here must not cost the shopper their list.
        val lists = try {
            loadLists()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Throwable) {
            emptyList()
        }
        _lists.value = lists
        // The selected list was deleted on another device: fall back to the one that always exists.
        if (_selected.value != DEFAULT_LIST_ID && lists.none { it.id == _selected.value }) {
            _selected.value = DEFAULT_LIST_ID
        }

        try {
            val items = listSaved(_selected.value)
            _state.value = SavedUiState.Ready(items)
            runCatching { loadMembership() }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Throwable) {
            _state.value = SavedUiState.Error
        }
    }

    /**
     * ⚠ REMOVES FROM THE SELECTED LIST ONLY (068 FR-024). This used to be the heart's un-save, which
     * the platform now refuses for a product in a named list; from a list's own screen the shopper
     * has said exactly which list they mean, so there is nothing to refuse.
     */
    fun remove(item: SavedItem) {
        val current = _state.value
        if (current !is SavedUiState.Ready) return
        val listId = _selected.value
        _state.value = SavedUiState.Ready(current.items.filterNot { it.productId == item.productId })

        viewModelScope.launch {
            try {
                removeFromList(listId, item.productId)
                _undo.value = PendingUndo(item, item.savedAt, listId)
                refreshLists()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                _state.value = current // put it back — the platform refused
            }
        }
    }

    /** Undo returns the product to the position it held IN THAT LIST, not the top (FR-018). */
    fun undoRemoval() {
        val pending = _undo.value ?: return
        _undo.value = null
        viewModelScope.launch {
            try {
                addToList(pending.listId, pending.item.productId, pending.savedAt)
                fetch() // re-read so the item lands back in its real position
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
            }
        }
    }

    fun dismissUndo() { _undo.value = null }

    /** The chooser may have taken a product out of the list on screen. */
    fun onChooserClosed() {
        viewModelScope.launch { fetch() }
    }

    /** [onResult] gets null when the list was made, or the sentence saying why it was not. */
    fun createList(name: String, onResult: (String?) -> Unit) {
        viewModelScope.launch {
            val error = attempt {
                val list = createList(name, null)
                _selected.value = list.id
                fetch()
            }
            onResult(error)
        }
    }

    fun renameSelected(name: String, onResult: (String?) -> Unit) {
        val listId = _selected.value
        viewModelScope.launch {
            val error = attempt {
                renameList(listId, name)
                refreshLists()
            }
            onResult(error)
        }
    }

    /** Products in another list stay there; the rest stop being saved, as the confirmation said. */
    fun deleteSelected(onResult: (String?) -> Unit) {
        val listId = _selected.value
        viewModelScope.launch {
            val error = attempt {
                deleteList(listId)
                _selected.value = DEFAULT_LIST_ID
                fetch()
            }
            onResult(error)
        }
    }

    private suspend fun refreshLists() {
        runCatching { loadLists() }.onSuccess { _lists.value = it }
    }

    private suspend fun attempt(block: suspend () -> Unit): String? =
        try {
            block()
            null
        } catch (e: CancellationException) {
            throw e
        } catch (e: ListRefusedException) {
            listRefusalText(e.refusal)
        } catch (_: Throwable) {
            listRefusalText(null)
        }
}
