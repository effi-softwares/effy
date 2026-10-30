package com.effyshopping.customer.mobile.features.addresses.presentation

import com.effyshopping.customer.mobile.features.deliveryinstructions.domain.InstructionsDraft
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.features.addresses.domain.AddAddress
import com.effyshopping.customer.mobile.features.addresses.domain.DeleteAddress
import com.effyshopping.customer.mobile.features.addresses.domain.ListAddresses
import com.effyshopping.customer.mobile.features.addresses.domain.SavedAddress
import com.effyshopping.customer.mobile.features.addresses.domain.SetDefault
import com.effyshopping.customer.mobile.features.addresses.domain.UpdateAddress
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** The label presets. Home/Work store the literal string; Other → the free-text field. */
enum class LabelChip { NONE, HOME, WORK, OTHER }

/** The add/edit form fields. Held in the ViewModel so validation errors survive with the input. */
data class AddressForm(
    val labelChip: LabelChip = LabelChip.NONE,
    val otherLabel: String = "",
    val recipientName: String = "",
    val phone: String = "",
    val line1: String = "",
    val line2: String = "",
    val city: String = "",
    val region: String = "",
    val postalCode: String = "",
    /** The address's default delivery instructions, edited with the same control as checkout. */
    val instructions: InstructionsDraft = InstructionsDraft(),
)

/** The open add/edit sheet. [editingId] null = add; non-null = edit that address. */
data class FormSheet(
    val editingId: String?,
    val form: AddressForm,
    val fieldErrors: Map<String, String> = emptyMap(),
    val saving: Boolean = false,
)

data class AddressBookUiState(
    val loading: Boolean = true,
    val addresses: List<SavedAddress> = emptyList(),
    val error: String? = null,
    val sheet: FormSheet? = null,
    /** The address a confirm-delete dialog is pending on. */
    val pendingDeleteId: String? = null,
    /** True once a delete-default was blocked server-side - show the "set another default" prompt. */
    val reassignPrompt: Boolean = false,
)

/**
 * Address book ViewModel: immutable [AddressBookUiState] over a `MutableStateFlow`. The form lives here,
 * so a validation failure keeps the input and dismissing the sheet saves nothing. [scope] is the test seam
 * (null → [viewModelScope]).
 */
class AddressBookViewModel(
    private val listAddresses: ListAddresses,
    private val addAddress: AddAddress,
    private val updateAddress: UpdateAddress,
    private val setDefault: SetDefault,
    private val deleteAddress: DeleteAddress,
    private val testScope: CoroutineScope? = null,
) : ViewModel() {

    private val scope: CoroutineScope get() = testScope ?: viewModelScope

    private val _state = MutableStateFlow(AddressBookUiState())
    val state: StateFlow<AddressBookUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        _state.value = _state.value.copy(loading = true, error = null)
        scope.launch {
            try {
                _state.value = _state.value.copy(loading = false, addresses = listAddresses(), error = null)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                _state.value = _state.value.copy(loading = false, error = "We couldn’t load your addresses. Pull to retry.")
            }
        }
    }

    // the add/edit sheet

    /** Raise the empty add form (from the FAB). */
    fun openAdd() {
        _state.value = _state.value.copy(sheet = FormSheet(editingId = null, form = AddressForm()))
    }

    /** Open the sheet pre-filled from an existing address (row-body tap; controls do not call this). */
    fun openEdit(id: String) {
        val address = _state.value.addresses.firstOrNull { it.id == id } ?: return
        _state.value = _state.value.copy(sheet = FormSheet(editingId = id, form = address.toForm()))
    }
    // `toForm`/`validate`/`toDraft` are the shared AddressFormLogic extensions (reused by Checkout, 023).

    /** Dismissing the sheet mid-entry discards everything - nothing is saved. */
    fun dismissSheet() {
        _state.value = _state.value.copy(sheet = null)
    }

    /** The View pushes the whole form back on every edit (no server data hand-cached; VM owns it). */
    fun onFormChange(form: AddressForm) {
        val sheet = _state.value.sheet ?: return
        _state.value = _state.value.copy(sheet = sheet.copy(form = form, fieldErrors = emptyMap()))
    }

    /** Validate, then create or update. Invalid → field errors, input preserved. */
    fun submit() {
        val sheet = _state.value.sheet ?: return
        val errors = sheet.form.validate()
        if (errors.isNotEmpty()) {
            _state.value = _state.value.copy(sheet = sheet.copy(fieldErrors = errors))
            return
        }
        val draft = sheet.form.toDraft()
        _state.value = _state.value.copy(sheet = sheet.copy(saving = true))
        scope.launch {
            try {
                if (sheet.editingId == null) addAddress(draft) else updateAddress(sheet.editingId, draft)
                _state.value = _state.value.copy(sheet = null)
                refresh()
            } catch (e: CancellationException) {
                throw e
            } catch (e: AppException) {
                _state.value = _state.value.copy(sheet = sheet.copy(saving = false), error = message(e.error))
            } catch (_: Throwable) {
                _state.value = _state.value.copy(sheet = sheet.copy(saving = false), error = "Couldn’t save the address. Please try again.")
            }
        }
    }

    // set-default

    /** Make [id] the default. Idempotent - the backend clears the prior default atomically. */
    fun makeDefault(id: String) {
        if (_state.value.addresses.firstOrNull { it.id == id }?.isDefault == true) return // no-op
        scope.launch {
            try {
                setDefault(id)
                refresh()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                _state.value = _state.value.copy(error = "Couldn’t change your default address. Please try again.")
            }
        }
    }

    // delete

    /** Ask to confirm before removing. */
    fun askDelete(id: String) {
        _state.value = _state.value.copy(pendingDeleteId = id)
    }

    fun cancelDelete() {
        _state.value = _state.value.copy(pendingDeleteId = null)
    }

    fun dismissReassignPrompt() {
        _state.value = _state.value.copy(reassignPrompt = false)
    }

    /** Confirmed delete. A blocked default raises the reassign prompt rather than an error. */
    fun confirmDelete() {
        val id = _state.value.pendingDeleteId ?: return
        _state.value = _state.value.copy(pendingDeleteId = null)
        scope.launch {
            try {
                deleteAddress(id)
                refresh()
            } catch (e: CancellationException) {
                throw e
            } catch (e: AppException) {
                if (e.error is AppError.DefaultDeleteBlocked) {
                    _state.value = _state.value.copy(reassignPrompt = true)
                } else {
                    _state.value = _state.value.copy(error = message(e.error))
                }
            } catch (_: Throwable) {
                _state.value = _state.value.copy(error = "Couldn’t delete the address. Please try again.")
            }
        }
    }

    private suspend fun refresh() {
        runCatching { listAddresses() }.onSuccess {
            _state.value = _state.value.copy(addresses = it, loading = false)
        }
    }

    private fun message(e: AppError): String = when (e) {
        is AppError.Validation -> e.message
        AppError.Network -> "No connection. Check your network and try again."
        AppError.Unavailable -> "We’re having trouble right now. Try again shortly."
        else -> "Something went wrong. Try again."
    }
}
