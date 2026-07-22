package com.effyshopping.customer.mobile.features.checkout.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.customer.mobile.features.addresses.domain.AddAddress
import com.effyshopping.customer.mobile.features.addresses.domain.ListAddresses
import com.effyshopping.customer.mobile.features.addresses.domain.SavedAddress
import com.effyshopping.customer.mobile.features.addresses.presentation.AddressForm
import com.effyshopping.customer.mobile.features.addresses.presentation.toDraft
import com.effyshopping.customer.mobile.features.addresses.presentation.validate
import com.effyshopping.customer.mobile.features.cart.domain.CartMergeRepository
import com.effyshopping.customer.mobile.features.cart.domain.GuestCartStore
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryMethod
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryQuote
import com.effyshopping.customer.mobile.features.checkout.domain.DeliverySelection
import com.effyshopping.customer.mobile.features.checkout.domain.PayForOrder
import com.effyshopping.customer.mobile.features.checkout.domain.PayOutcome
import com.effyshopping.customer.mobile.features.checkout.domain.PlaceOrder
import com.effyshopping.customer.mobile.features.checkout.domain.QuoteDelivery
import com.effyshopping.customer.mobile.features.checkout.domain.QuotePackage
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
     * The address + delivery step (021, extended 023). The SHIPPING address is [selectedId] over the
     * customer's saved addresses (022 book); once selected a [quote] is fetched and the customer picks a
     * [defaultPreference] + per-package [selections], confirming any [setAsideConfirmed] undeliverable
     * items before paying.
     *
     * BILLING (023 US4): defaults to the shipping address ([billingSameAsShipping] = true). When turned
     * OFF the customer chooses [billingSelectedId] from the same saved list (or adds one); turning it back
     * ON discards that choice (FR-013). [sheet] is the shared add-address form when open.
     */
    data class Ready(
        val addresses: List<SavedAddress>,
        val selectedId: String?,
        val quoting: Boolean = false,
        val quote: DeliveryQuote? = null,
        val defaultPreference: DeliveryMethod? = null,
        // Effective per-package selection, keyed by packageKey — only for SERVICEABLE packages.
        val selections: Map<String, DeliverySelection> = emptyMap(),
        val setAsideConfirmed: Boolean = false,
        val billingSameAsShipping: Boolean = true,
        val billingSelectedId: String? = null,
        val sheet: CheckoutAddressSheet? = null,
        val paying: Boolean = false,
        val error: String? = null,
        val requoteNotice: String? = null,
    ) : CheckoutUiState {
        /** The billing id to SEND (023): only when diverged AND different from shipping; else null. */
        val effectiveBillingId: String?
            get() = billingSelectedId?.takeIf { !billingSameAsShipping && it != selectedId }
    }

    data class Placed(val orderId: String) : CheckoutUiState
}

/**
 * The checkout ViewModel (019 US3, extended 021 delivery + 023 shipping/billing addresses). On entry it
 * merges the device-local guest cart into the server cart (the customer has just signed in) and loads the
 * saved addresses from the 022 Address Book — the SAME list the account page manages (023 US1). The
 * default is pre-selected as the shipping address and its quote fetched; the customer may switch to
 * another saved address or add a new one inline (023 US2/US3), and may give a divergent billing address
 * (023 US4). The client NEVER sends a fee (SC-004), and billing never affects the amount.
 *
 * MVVM: immutable [CheckoutUiState] over a `MutableStateFlow`; the View calls functions, never mutates.
 */
class CheckoutViewModel(
    private val guestCart: GuestCartStore,
    private val cartRepo: CartMergeRepository,
    private val listAddresses: ListAddresses,
    private val addAddress: AddAddress,
    private val quoteDelivery: QuoteDelivery,
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
            // Pre-select the default; deterministic to the first saved address when none is default (FR-002).
            val selectedId = addresses.firstOrNull { it.isDefault }?.id ?: addresses.firstOrNull()?.id
            _state.value = CheckoutUiState.Ready(addresses = addresses, selectedId = selectedId)
            if (selectedId != null) loadQuote(selectedId)
        }
    }

    /** Switch the SHIPPING address (023 US2). Per-order only — never changes the saved default (FR-006). */
    fun select(id: String) {
        val s = ready() ?: return
        if (s.selectedId == id) return
        // Address changed → every package re-quotes for the new address (FR-005); drop the stale quote.
        _state.value = s.copy(
            selectedId = id,
            quote = null,
            selections = emptyMap(),
            setAsideConfirmed = false,
            error = null,
            requoteNotice = null,
        )
        loadQuote(id)
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

    // ── Delivery options (021) ─────────────────────────────────────────────────────────────────────────

    private fun loadQuote(addressId: String, notice: String? = null) {
        _state.value = (ready() ?: return).copy(quoting = true, error = null, requoteNotice = notice)
        viewModelScope.launch {
            val result = runCatching { quoteDelivery(addressId) }
            val s = ready() ?: return@launch
            result.fold(
                onSuccess = { quote ->
                    _state.value = s.copy(
                        quoting = false,
                        quote = quote,
                        selections = defaultSelections(quote, s.defaultPreference),
                        setAsideConfirmed = false,
                    )
                },
                onFailure = {
                    if (it is CancellationException) throw it
                    _state.value = s.copy(quoting = false, quote = null, error = "We couldn’t work out delivery for that address. Please try another.")
                },
            )
        }
    }

    /** Apply one preference to every serviceable package (FR-006a); a package without it keeps its option. */
    fun setDefaultPreference(method: DeliveryMethod) {
        val s = ready() ?: return
        val quote = s.quote ?: return
        _state.value = s.copy(
            defaultPreference = method,
            selections = quote.serviceablePackages.associate { pkg ->
                pkg.packageKey to (selectionFor(pkg, method) ?: s.selections.getValue(pkg.packageKey))
            },
        )
    }

    /** Override the method on ONE package (FR-006a); only that package changes. */
    fun overridePackage(packageKey: String, method: DeliveryMethod) {
        val s = ready() ?: return
        val pkg = s.quote?.serviceablePackages?.firstOrNull { it.packageKey == packageKey } ?: return
        val selection = selectionFor(pkg, method) ?: return
        _state.value = s.copy(selections = s.selections + (packageKey to selection))
    }

    /** Pick a specific date for a scheduled package. */
    fun setScheduledDate(packageKey: String, date: String) {
        val s = ready() ?: return
        val current = s.selections[packageKey] ?: return
        _state.value = s.copy(selections = s.selections + (packageKey to current.copy(scheduledDate = date)))
    }

    /** The explicit confirmation to proceed without the auto-set-aside items (FR-006b). */
    fun confirmSetAside(confirmed: Boolean) {
        val s = ready() ?: return
        _state.value = s.copy(setAsideConfirmed = confirmed, error = null)
    }

    fun payNow() {
        val s = ready() ?: return
        val addressId = s.selectedId ?: run {
            _state.value = s.copy(error = "Add a delivery address to continue."); return
        }
        val quote = s.quote ?: run {
            _state.value = s.copy(error = "Choose a delivery address to see options."); return
        }
        if (quote.fullyUndeliverable) {
            _state.value = s.copy(error = "We can’t deliver any of these items to that address. Try a different address."); return
        }
        if (quote.hasSetAside && !s.setAsideConfirmed) {
            _state.value = s.copy(error = "Please confirm proceeding without the set-aside items."); return
        }
        // US4: a divergent billing address must be chosen before paying (FR-012).
        if (!s.billingSameAsShipping && s.billingSelectedId == null) {
            _state.value = s.copy(error = "Choose a billing address."); return
        }

        val order = PlaceOrder(
            addressId = addressId,
            quoteId = quote.quoteId,
            selections = quote.serviceablePackages.mapNotNull { s.selections[it.packageKey] },
            excludedPackageKeys = quote.excludedPackageKeys,
            billingAddressId = s.effectiveBillingId,
        )
        _state.value = s.copy(paying = true, error = null, requoteNotice = null)
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
                    guestCart.clear()
                    _state.value = CheckoutUiState.Placed(outcome.orderId)
                }
                PayOutcome.Canceled -> _state.value = (ready() ?: return@launch).copy(paying = false)
                PayOutcome.Requote -> {
                    _state.value = (ready() ?: return@launch).copy(paying = false)
                    loadQuote(addressId, notice = "Prices updated since you started. Please review the new amounts before paying.")
                }
                is PayOutcome.Failed -> _state.value = (ready() ?: return@launch).copy(paying = false, error = outcome.message)
            }
        }
    }

    private fun ready(): CheckoutUiState.Ready? = _state.value as? CheckoutUiState.Ready

    private companion object {
        /** Default each serviceable package to the preference (or its first option); null-safe date pick. */
        fun defaultSelections(quote: DeliveryQuote, preference: DeliveryMethod?): Map<String, DeliverySelection> =
            quote.serviceablePackages.associate { pkg ->
                val selection = (preference?.let { selectionFor(pkg, it) }) ?: firstSelection(pkg)
                pkg.packageKey to selection
            }

        fun firstSelection(pkg: QuotePackage): DeliverySelection {
            val option = pkg.options.first()
            return DeliverySelection(pkg.packageKey, option.method, if (option.method == DeliveryMethod.SCHEDULED) option.scheduleDates.firstOrNull() else null)
        }

        fun selectionFor(pkg: QuotePackage, method: DeliveryMethod): DeliverySelection? {
            val option = pkg.optionFor(method) ?: return null
            return DeliverySelection(pkg.packageKey, method, if (method == DeliveryMethod.SCHEDULED) option.scheduleDates.firstOrNull() else null)
        }
    }
}
