package com.effyshopping.customer.mobile.features.checkout.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.customer.mobile.features.addresses.domain.AddAddress
import com.effyshopping.customer.mobile.features.addresses.domain.ListAddresses
import com.effyshopping.customer.mobile.features.addresses.domain.SavedAddress
import com.effyshopping.customer.mobile.features.addresses.presentation.AddressForm
import com.effyshopping.customer.mobile.features.addresses.presentation.toDraft
import com.effyshopping.customer.mobile.features.addresses.presentation.validate
import com.effyshopping.customer.mobile.features.cart.domain.CartStore
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryMethod
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryQuote
import com.effyshopping.customer.mobile.features.checkout.domain.PayForOrder
import com.effyshopping.customer.mobile.features.checkout.domain.PayOutcome
import com.effyshopping.customer.mobile.features.checkout.domain.PlaceOrder
import com.effyshopping.customer.mobile.features.checkout.domain.QuoteDelivery
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Which selection an open add-address sheet fills once saved (023 US3/US4). */
enum class AddressTarget { SHIPPING, BILLING }

/** The open add-address sheet at checkout — reuses the 022 [AddressForm] + shared validation. */
data class CheckoutAddressSheet(
    val target: AddressTarget,
    val form: AddressForm = AddressForm(),
    val fieldErrors: Map<String, String> = emptyMap(),
    val saving: Boolean = false,
)

sealed interface CheckoutUiState {
    data object Loading : CheckoutUiState

    /**
     * The address step. The SHIPPING address is [selectedId] over the customer's saved addresses
     * (022 book).
     *
     * ⚠ THERE IS NO DELIVERY STEP. This state used to carry a fetched quote, a method preference,
     * per-package selections and a set-aside confirmation. Delivery zones, quotes and fees were
     * withdrawn from the platform, so checkout is now: choose an address, pay.
     *
     * BILLING (023 US4): defaults to the shipping address ([billingSameAsShipping] = true). When turned
     * OFF the customer chooses [billingSelectedId] from the same saved list (or adds one); turning it back
     * ON discards that choice (FR-013). [sheet] is the shared add-address form when open.
     */
    data class Ready(
        val addresses: List<SavedAddress>,
        val selectedId: String?,
        val billingSameAsShipping: Boolean = true,
        val billingSelectedId: String? = null,
        val sheet: CheckoutAddressSheet? = null,
        val paying: Boolean = false,
        val error: String? = null,
        // 047: the delivery quote for the selected address (null while none/loading), whether it is being
        // fetched, and the shopper's method choice. serviced=false ⇒ "we don't deliver there yet".
        val quote: DeliveryQuote? = null,
        val quoting: Boolean = false,
        val method: DeliveryMethod = DeliveryMethod.STANDARD,
    ) : CheckoutUiState {
        /** The billing id to SEND (023): only when diverged AND different from shipping; else null. */
        val effectiveBillingId: String?
            get() = billingSelectedId?.takeIf { !billingSameAsShipping && it != selectedId }

        /** Serviced ⇔ a quote came back for a served address. Pay is blocked otherwise (047 FR-002). */
        val serviced: Boolean get() = quote?.serviced == true

        /** Same-day is choosable only when the whole order qualifies (FR-044 order-level presentation). */
        val sameDayOfferable: Boolean get() = quote?.sameDayAvailable == true
    }

    data class Placed(val orderId: String) : CheckoutUiState
}

/**
 * The checkout ViewModel (019 US3, extended 021 delivery + 023 shipping/billing addresses; reworked 027).
 *
 * ⚠ 027: entry no longer pushes the device cart anywhere. The platform is authoritative for a signed-in
 * shopper's cart, so checkout quotes and prices the SAME cart every other surface reads — the sign-in
 * merge happens once, in `SessionManager`, not on every checkout entry. On entry this now only loads the
 * saved addresses from the 022 Address Book — the SAME list the account page manages (023 US1). The
 * default is pre-selected as the shipping address and its quote fetched; the customer may switch to
 * another saved address or add a new one inline (023 US2/US3), and may give a divergent billing address
 * (023 US4). The client NEVER sends a fee (SC-004), and billing never affects the amount.
 *
 * MVVM: immutable [CheckoutUiState] over a `MutableStateFlow`; the View calls functions, never mutates.
 */
class CheckoutViewModel(
    private val cart: CartStore,
    private val listAddresses: ListAddresses,
    private val addAddress: AddAddress,
    private val pay: PayForOrder,
    private val quoteDelivery: QuoteDelivery,
) : ViewModel() {

    private val _state = MutableStateFlow<CheckoutUiState>(CheckoutUiState.Loading)
    val state: StateFlow<CheckoutUiState> = _state.asStateFlow()

    init {
        start()
    }

    private fun start() {
        viewModelScope.launch {
            // ⚠ 027: the checkout-entry cart snapshot is GONE. Under 019's Option B the device cart was
            // the source of truth, so checkout had to push it to the server before quoting. The platform
            // is authoritative now (research R0), which means checkout reads the SAME cart every other
            // surface reads — and keeping a snapshot here would give checkout a second source of truth,
            // which is precisely the 2026-07-23 bug family under a new name.
            val addresses = runCatching { listAddresses() }.getOrDefault(emptyList())
            // Pre-select the default; deterministic to the first saved address when none is default (FR-002).
            val selectedId = addresses.firstOrNull { it.isDefault }?.id ?: addresses.firstOrNull()?.id
            _state.value = CheckoutUiState.Ready(addresses = addresses, selectedId = selectedId)
            if (selectedId != null) refreshQuote(selectedId)
        }
    }

    /** Switch the SHIPPING address (023 US2). Per-order only — never changes the saved default (FR-006). */
    fun select(id: String) {
        val s = ready() ?: return
        if (s.selectedId == id) return
        // A new address re-prices delivery (FR-004): reset the method to standard until the quote returns.
        _state.value = s.copy(selectedId = id, quote = null, method = DeliveryMethod.STANDARD, error = null)
        refreshQuote(id)
    }

    /** Choose standard vs same-day (047 US2). Only meaningful when the whole order can do same-day. */
    fun setMethod(method: DeliveryMethod) {
        val s = ready() ?: return
        if (method == DeliveryMethod.SAME_DAY && !s.sameDayOfferable) return
        _state.value = s.copy(method = method)
    }

    /**
     * 047: fetch the delivery quote for [addressId] and fold it into state. A stale response for an
     * address the shopper has since moved past is discarded (the selected id no longer matches).
     */
    private fun refreshQuote(addressId: String) {
        _state.value = (ready() ?: return).copy(quoting = true)
        viewModelScope.launch {
            val q = runCatching { quoteDelivery(addressId) }.getOrNull()
            val cur = ready() ?: return@launch
            if (cur.selectedId != addressId) return@launch // moved on — ignore this answer
            _state.value = cur.copy(
                quote = q,
                quoting = false,
                // If same-day is no longer offerable for this address, fall back to standard.
                method = if (q?.sameDayAvailable == true) cur.method else DeliveryMethod.STANDARD,
            )
        }
    }

    // ── Billing (023 US4) ────────────────────────────────────────────────────────────────────────────

    /** Toggle "Billing same as shipping". Turning it back ON discards the divergent choice (FR-013). */
    fun setBillingSameAsShipping(same: Boolean) {
        val s = ready() ?: return
        _state.value = s.copy(
            billingSameAsShipping = same,
            billingSelectedId = if (same) null else s.billingSelectedId,
            error = null,
        )
    }

    /** Choose a saved address as the divergent BILLING address (US4). */
    fun selectBilling(id: String) {
        val s = ready() ?: return
        _state.value = s.copy(billingSelectedId = id, error = null)
    }

    // ── Add a new address inline (023 US3) — reuses the 022 form + edge create ────────────────────────

    fun openAddAddress(target: AddressTarget) {
        val s = ready() ?: return
        _state.value = s.copy(sheet = CheckoutAddressSheet(target = target))
    }

    fun onSheetFormChange(form: AddressForm) {
        val s = ready() ?: return
        val sheet = s.sheet ?: return
        _state.value = s.copy(sheet = sheet.copy(form = form, fieldErrors = emptyMap()))
    }

    /** Dismissing the sheet mid-entry saves nothing (SC-009). */
    fun dismissSheet() {
        val s = ready() ?: return
        _state.value = s.copy(sheet = null)
    }

    /** Validate → create via the edge address book → select the new address for its target. */
    fun submitAddress() {
        val s = ready() ?: return
        val sheet = s.sheet ?: return
        val errors = sheet.form.validate()
        if (errors.isNotEmpty()) {
            _state.value = s.copy(sheet = sheet.copy(fieldErrors = errors))
            return
        }
        _state.value = s.copy(sheet = sheet.copy(saving = true))
        viewModelScope.launch {
            try {
                val created = addAddress(sheet.form.toDraft())
                val cur = ready() ?: return@launch
                _state.value = cur.copy(addresses = cur.addresses + created, sheet = null, error = null)
                when (sheet.target) {
                    AddressTarget.SHIPPING -> select(created.id)
                    AddressTarget.BILLING -> selectBilling(created.id)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                val cur = ready() ?: return@launch
                _state.value = cur.copy(
                    sheet = cur.sheet?.copy(saving = false),
                    error = "Couldn’t save the address. Please check and try again.",
                )
            }
        }
    }

    fun payNow() {
        val s = ready() ?: return
        val addressId = s.selectedId ?: run {
            _state.value = s.copy(error = "Add a delivery address to continue."); return
        }
        // US4: a divergent billing address must be chosen before paying (FR-012).
        if (!s.billingSameAsShipping && s.billingSelectedId == null) {
            _state.value = s.copy(error = "Choose a billing address."); return
        }
        // 047 FR-002: never let a shopper pay for an address we can't deliver to.
        if (!s.serviced) {
            _state.value = s.copy(error = "We don’t deliver to this address yet. Choose another address."); return
        }

        val order = PlaceOrder(
            addressId = addressId,
            billingAddressId = s.effectiveBillingId,
            deliveryMethod = s.method,
        )
        _state.value = s.copy(paying = true, error = null)
        viewModelScope.launch {
            val outcome = try {
                pay(order)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                PayOutcome.Failed("We couldn’t start payment. Please try again.")
            }
            when (outcome) {
                is PayOutcome.Placed -> {
                    cart.clear()
                    _state.value = CheckoutUiState.Placed(outcome.orderId)
                }
                PayOutcome.Canceled -> _state.value = (ready() ?: return@launch).copy(paying = false)
                is PayOutcome.Failed -> _state.value = (ready() ?: return@launch).copy(paying = false, error = outcome.message)
            }
        }
    }

    private fun ready(): CheckoutUiState.Ready? = _state.value as? CheckoutUiState.Ready

}
