package com.effyshopping.customer.mobile.features.paymentmethods.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.features.paymentmethods.domain.KeptCard
import com.effyshopping.customer.mobile.features.paymentmethods.domain.ListPaymentMethods
import com.effyshopping.customer.mobile.features.paymentmethods.domain.RemovePaymentMethod
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Payment methods (051 US6) — `ViewModel → UseCase → Repository` (Principle VI).
 *
 * ⚠ THREE STATES, NOT TWO. Loading, "you have no cards", and "we could not ask" are all different, and
 * the last two are the pair that matters: a list rendered empty after a failed read tells a shopper
 * with saved cards something FALSE about their own account (FR-036). `loadFailed` is what keeps them
 * apart, and `catch { cards = emptyList() }` is the mistake it exists to prevent — which looks like
 * sensible defensive code, and is why it is easy to ship.
 */
data class PaymentMethodsUiState(
    val loading: Boolean = true,
    val cards: List<KeptCard> = emptyList(),
    /** The read failed. NOT the same as having no cards. */
    val loadFailed: Boolean = false,
    /** A card currently being removed, so its row can show progress and refuse a second press. */
    val removing: String? = null,
    /** A message about a failed action — never about a failed read, which `loadFailed` carries. */
    val error: String? = null,
)

class PaymentMethodsViewModel(
    private val listPaymentMethods: ListPaymentMethods,
    private val removePaymentMethod: RemovePaymentMethod,
) : ViewModel() {

    private val _state = MutableStateFlow(PaymentMethodsUiState())
    val state: StateFlow<PaymentMethodsUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        _state.value = _state.value.copy(loading = true, loadFailed = false, error = null)
        viewModelScope.launch {
            try {
                _state.value = _state.value.copy(loading = false, cards = listPaymentMethods())
            } catch (e: AppException) {
                // ⚠ NOT an empty list. See the class note.
                _state.value = _state.value.copy(loading = false, loadFailed = true)
            }
        }
    }

    fun remove(id: String) {
        if (_state.value.removing != null) return
        _state.value = _state.value.copy(removing = id, error = null)
        viewModelScope.launch {
            try {
                removePaymentMethod(id)
                _state.value = _state.value.copy(
                    removing = null,
                    cards = _state.value.cards.filterNot { it.id == id },
                )
            } catch (e: AppException) {
                // ⚠ The card STAYS in the list. Dropping it optimistically after a failed removal would
                // show the shopper a card that still exists at the provider and can still be charged.
                _state.value = _state.value.copy(removing = null, error = message(e.error))
            }
        }
    }

    fun dismissError() {
        _state.value = _state.value.copy(error = null)
    }

    /** Every message names what did NOT happen: the shopper's cards are unchanged (FR-036). */
    private fun message(e: AppError): String = when (e) {
        AppError.Network -> "No connection. Your cards are unchanged — try again in a moment."
        AppError.Unavailable -> "We're having trouble right now. Your cards are unchanged — try again shortly."
        else -> "We couldn't remove that card. Your cards are unchanged — try again in a moment."
    }
}
