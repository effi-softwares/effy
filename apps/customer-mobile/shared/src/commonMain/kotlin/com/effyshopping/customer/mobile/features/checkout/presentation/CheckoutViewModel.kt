package com.effyshopping.customer.mobile.features.checkout.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.customer.mobile.features.cart.data.HttpCartRepository
import com.effyshopping.customer.mobile.features.cart.domain.GuestCartStore
import com.effyshopping.customer.mobile.features.checkout.domain.Address
import com.effyshopping.customer.mobile.features.checkout.domain.CreateAddress
import com.effyshopping.customer.mobile.features.checkout.domain.ListAddresses
import com.effyshopping.customer.mobile.features.checkout.domain.NewAddress
import com.effyshopping.customer.mobile.features.checkout.domain.PayForOrder
import com.effyshopping.customer.mobile.features.checkout.domain.PayOutcome
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface CheckoutUiState {
    data object Loading : CheckoutUiState
    data class Ready(
        val addresses: List<Address>,
        val selectedId: String?,
        val paying: Boolean = false,
        val error: String? = null,
    ) : CheckoutUiState

    data class Placed(val orderId: String) : CheckoutUiState
}

/**
 * The checkout ViewModel (019 US3). On entry it merges the device-local guest cart into the server cart
 * (the customer has just signed in), loads delivery addresses, and drives the pay flow via [PayForOrder]
 * (create intent → native PaymentSheet → confirm). On success it clears the guest cart and yields the
 * order id for the receipt.
 */
class CheckoutViewModel(
    private val guestCart: GuestCartStore,
    private val cartRepo: HttpCartRepository,
    private val listAddresses: ListAddresses,
    private val createAddress: CreateAddress,
    private val pay: PayForOrder,
) : ViewModel() {

    private val _state = MutableStateFlow<CheckoutUiState>(CheckoutUiState.Loading)
    val state: StateFlow<CheckoutUiState> = _state.asStateFlow()

    init {
        start()
    }

    private fun start() {
        viewModelScope.launch {
            runCatching { cartRepo.merge(guestCart.snapshot()) } // best-effort; server is authoritative
            val addresses = runCatching { listAddresses() }.getOrDefault(emptyList())
            _state.value = CheckoutUiState.Ready(
                addresses = addresses,
                selectedId = addresses.firstOrNull { it.isDefault }?.id ?: addresses.firstOrNull()?.id,
            )
        }
    }

    fun select(id: String) {
        val s = _state.value as? CheckoutUiState.Ready ?: return
        _state.value = s.copy(selectedId = id, error = null)
    }

    fun addAddress(input: NewAddress) {
        val s = _state.value as? CheckoutUiState.Ready ?: return
        viewModelScope.launch {
            try {
                val created = createAddress(input)
                _state.value = s.copy(addresses = s.addresses + created, selectedId = created.id, error = null)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                _state.value = s.copy(error = "Couldn’t save the address. Please check and try again.")
            }
        }
    }

    fun payNow() {
        val s = _state.value as? CheckoutUiState.Ready ?: return
        val addressId = s.selectedId ?: run {
            _state.value = s.copy(error = "Choose a delivery address.")
            return
        }
        _state.value = s.copy(paying = true, error = null)
        viewModelScope.launch {
            val outcome = try {
                pay(addressId)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                PayOutcome.Failed("We couldn’t start payment. Please try again.")
            }
            when (outcome) {
                is PayOutcome.Placed -> {
                    guestCart.clear()
                    _state.value = CheckoutUiState.Placed(outcome.orderId)
                }
                PayOutcome.Canceled -> _state.value = s.copy(paying = false)
                is PayOutcome.Failed -> _state.value = s.copy(paying = false, error = outcome.message)
            }
        }
    }
}
