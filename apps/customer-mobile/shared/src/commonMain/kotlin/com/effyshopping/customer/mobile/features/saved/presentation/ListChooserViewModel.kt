package com.effyshopping.customer.mobile.features.saved.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.customer.mobile.features.saved.domain.AddToList
import com.effyshopping.customer.mobile.features.saved.domain.CreateList
import com.effyshopping.customer.mobile.features.saved.domain.ListRefusal
import com.effyshopping.customer.mobile.features.saved.domain.ListRefusedException
import com.effyshopping.customer.mobile.features.saved.domain.LoadLists
import com.effyshopping.customer.mobile.features.saved.domain.RemoveFromList
import com.effyshopping.customer.mobile.features.saved.domain.SavedList
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** What the list chooser is showing. */
sealed interface ListChooserState {
    data object Loading : ListChooserState

    /**
     * ⚠ A guest. Named lists need an account (068 FR-037). The save that brought them here already
     * happened, on this device, and is not lost.
     */
    data object SignedOut : ListChooserState

    data object Failed : ListChooserState

    data class Ready(
        val lists: List<SavedList>,
        /** The list a request is in flight for, or [NEW_LIST]. Every control is disabled meanwhile. */
        val pending: String? = null,
        /** A refusal about a tick box. */
        val error: String? = null,
        /** A refusal about the new list's name, shown on the field. */
        val nameError: String? = null,
    ) : ListChooserState

    companion object {
        const val NEW_LIST = "new"
    }
}

/**
 * The list chooser (068): which of the shopper's lists a product is in.
 *
 * ⚠ AFTER EVERY CHANGE THE LISTS ARE RE-READ rather than flipped locally. A list deleted on another
 * device must disappear, and the counts are the platform's.
 */
class ListChooserViewModel(
    private val productId: String,
    private val isSignedIn: () -> Boolean,
    private val loadLists: LoadLists,
    private val addToList: AddToList,
    private val removeFromList: RemoveFromList,
    private val createList: CreateList,
) : ViewModel() {

    private val _state = MutableStateFlow<ListChooserState>(ListChooserState.Loading)
    val state: StateFlow<ListChooserState> = _state.asStateFlow()

    init {
        if (!isSignedIn()) _state.value = ListChooserState.SignedOut
        else viewModelScope.launch { reload() }
    }

    private suspend fun reload(error: String? = null, nameError: String? = null) {
        _state.value = try {
            ListChooserState.Ready(loadLists(productId), error = error, nameError = nameError)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Throwable) {
            ListChooserState.Failed
        }
    }

    fun toggle(list: SavedList) {
        val current = _state.value as? ListChooserState.Ready ?: return
        if (current.pending != null) return
        _state.value = current.copy(pending = list.id, error = null)

        viewModelScope.launch {
            val error = attempt {
                if (list.containsProduct == true) removeFromList(list.id, productId)
                else addToList(list.id, productId)
            }
            reload(error = error)
        }
    }

    /** [onCreated] runs only when the list was made, so the caller can clear the field. */
    fun create(name: String, onCreated: () -> Unit) {
        val current = _state.value as? ListChooserState.Ready ?: return
        if (current.pending != null) return
        _state.value = current.copy(pending = ListChooserState.NEW_LIST, nameError = null)

        viewModelScope.launch {
            // ⚠ ONE call makes the list AND places the product in it (FR-015). A refusal makes neither.
            val error = attempt { createList(name, productId) }
            if (error == null) onCreated()
            reload(nameError = error)
        }
    }

    /** Runs [block]; answers the sentence to show when it was refused, or null when it went through. */
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

/** The shopper-facing sentence for a refusal. The platform's own prose is never shown. */
fun listRefusalText(refusal: ListRefusal?): String = when (refusal) {
    ListRefusal.NAME_TAKEN -> "You already have a list with that name."
    ListRefusal.INVALID_NAME -> "A list name needs 1 to 40 characters."
    ListRefusal.LIST_LIMIT -> "You've reached the maximum number of lists. Delete one to make another."
    ListRefusal.CAP_REACHED -> "You've reached the maximum number of saved items. Remove one to save another."
    ListRefusal.LIST_NOT_FOUND -> "That list no longer exists."
    ListRefusal.DEFAULT_LIST -> "This list can't be renamed or deleted."
    ListRefusal.IN_NAMED_LISTS, null -> "That didn't go through. Please try again."
}
