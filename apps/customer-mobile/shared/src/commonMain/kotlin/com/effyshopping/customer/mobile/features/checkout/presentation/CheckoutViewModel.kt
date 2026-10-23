package com.effyshopping.customer.mobile.features.checkout.presentation

import com.effyshopping.customer.mobile.core.delivery.CoverageWords
import com.effyshopping.customer.mobile.features.deliveryinstructions.domain.InstructionsDraft
import com.effyshopping.customer.mobile.features.addresses.domain.SaveAddressInstructions
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.customer.mobile.features.addresses.domain.AddAddress
import com.effyshopping.customer.mobile.features.addresses.domain.ListAddresses
import com.effyshopping.customer.mobile.features.addresses.domain.SavedAddress
import com.effyshopping.customer.mobile.features.addresses.presentation.AddressForm
import com.effyshopping.customer.mobile.features.addresses.presentation.toDraft
import com.effyshopping.customer.mobile.features.addresses.presentation.validate
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryChoiceRefusal
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryChoiceRefused
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryFeeChanged
import com.effyshopping.customer.mobile.features.checkout.domain.PromotionsChanged
import com.effyshopping.customer.mobile.features.checkout.domain.ChosenWindow
import com.effyshopping.customer.mobile.features.checkout.domain.EffyWindows
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryQuote
import com.effyshopping.customer.mobile.features.checkout.domain.CreateIntent
import com.effyshopping.customer.mobile.features.checkout.domain.PlaceOrder
import com.effyshopping.customer.mobile.features.checkout.domain.PointsRefusal
import com.effyshopping.customer.mobile.features.checkout.domain.PointsRefused
import com.effyshopping.customer.mobile.features.payment.domain.PaymentHandoff
import com.effyshopping.customer.mobile.features.checkout.domain.QuoteDelivery
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Which selection an open add-address sheet fills once saved. */
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
     * The checkout state: the shipping address is [selectedId] over the saved addresses, and [quote] is
     * its delivery quote. Billing defaults to the shipping address ([billingSameAsShipping]); turned off,
     * the customer picks [billingSelectedId] from the same list, and turning it back on discards that.
     * [sheet] is the add-address form when open.
     */
    data class Ready(
        val addresses: List<SavedAddress>,
        val selectedId: String?,
        val billingSameAsShipping: Boolean = true,
        val billingSelectedId: String? = null,
        val sheet: CheckoutAddressSheet? = null,
        val paying: Boolean = false,
        val error: String? = null,
        /**
         * A one-shot signal that the intent exists and the payment screen should open. Consumed
         * by the screen via [CheckoutViewModel.handoffConsumed].
         *
         * A one-shot, and not a terminal `Placed`-style state, because payment is now a screen the
         * shopper can come back from. A sticky flag would re-fire the moment they returned and bounce
         * them into payment again, with no way out but the app switcher.
         */
        val handedOffToPayment: Boolean = false,
        // The delivery quote for the selected address (null while none/loading) and whether it is being
        // fetched. serviced=false ⇒ nobody delivers there.
        val quote: DeliveryQuote? = null,
        val quoting: Boolean = false,
        /**
         * When — the one window for the order. Never chosen for the shopper: a
         * window is a promise about when someone will be home. Lives here so it survives the hand-off
         * to payment and a failed payment while it is still offered; dropped when the address changes.
         */
        val window: ChosenWindow? = null,
        /**
         * "as soon as possible" is chosen instead of a window. At most one of [window] / [asap].
         */
        val asap: Boolean = false,
        /**
         * What the shopper tells the driver. Starts from the selected address's saved default and
         * lives here, not in the control, so it survives the hand-off to payment and a failed payment.
         */
        val instructions: InstructionsDraft = InstructionsDraft(),
        /**
         * "save to this address". Off by default and reset whenever the address changes:
         * editing instructions for one order must never rewrite the saved default unasked.
         */
        val saveInstructions: Boolean = false,
        /** Pay with points? ON by default whenever the shopper has some (FR-012: the most they can). */
        val usePoints: Boolean = true,
        /**
         * A one-shot: points paid for the whole order, which is already placed. The screen opens
         * its receipt and disarms this via [CheckoutViewModel.placedConsumed].
         */
        val placedWithPoints: String? = null,
    ) : CheckoutUiState {
        /** The points control is shown only when the quote says the shopper has points. */
        val points get() = quote?.points?.takeIf { serviced }

        /** What the selected address has saved — to tell "using my default" from "changed for this order". */
        val savedInstructions: InstructionsDraft
            get() = InstructionsDraft.from(addresses.firstOrNull { it.id == selectedId }?.defaultInstructions)

        /** The save choice is offered only when there is something the address does not already hold. */
        val instructionsDiffer: Boolean get() = !instructions.sameAs(savedInstructions)

        /** The billing id to send: only when diverged and different from shipping; else null. */
        val effectiveBillingId: String?
            get() = billingSelectedId?.takeIf { !billingSameAsShipping && it != selectedId }

        /** Serviced ⇔ a quote came back for a served address. Pay is blocked otherwise. */
        val serviced: Boolean get() = quote?.serviced == true

        /** The windows Effy offers this order; null when a courier delivers or the address is not served. */
        val effyWindows: EffyWindows? get() = quote?.effyWindows?.takeIf { serviced }

        /** Set when a courier delivers this order: then there is nothing to choose. */
        val courier get() = quote?.courier?.takeIf { serviced }

        /** Every delivery choice this order needs has been made. A courier order needs none. */
        val deliveryChosen: Boolean
            get() = courier != null || effyWindows?.let {
                it.unavailable == null && (if (asap) it.asap != null else it.find(window) != null)
            } == true

        /**
         * What delivery costs for what is chosen, as the lines the server priced. Null until a
         * window is chosen. Picked, never added up: the server is the judge.
         */
        val deliveryFee get() = quote?.feeFor(window, asap)
    }

}

/**
 * The checkout ViewModel. The platform's cart is authoritative (the sign-in merge happens once, in
 * `SessionManager`), so entry loads the saved addresses, pre-selects the default and fetches its quote. The
 * client never sends a fee, and billing never affects the amount. Immutable [CheckoutUiState] over a
 * `MutableStateFlow`.
 */
class CheckoutViewModel(
    private val listAddresses: ListAddresses,
    private val addAddress: AddAddress,
    private val createIntent: CreateIntent,
    private val handoff: PaymentHandoff,
    private val quoteDelivery: QuoteDelivery,
    private val saveAddressInstructions: SaveAddressInstructions,
) : ViewModel() {

    private val _state = MutableStateFlow<CheckoutUiState>(CheckoutUiState.Loading)
    val state: StateFlow<CheckoutUiState> = _state.asStateFlow()

    init {
        start()
    }

    private fun start() {
        viewModelScope.launch {
            // The checkout-entry cart snapshot is gone. Under 019's Option B the device cart was
            // the source of truth, so checkout had to push it to the server before quoting. The platform
            // is authoritative now, which means checkout reads the same cart every other
            // surface reads — and keeping a snapshot here would give checkout a second source of truth,
            // which is precisely the 2026-07-23 bug family under a new name.
            val addresses = runCatching { listAddresses() }.getOrDefault(emptyList())
            // Pre-select the default; deterministic to the first saved address when none is default.
            val selectedId = addresses.firstOrNull { it.isDefault }?.id ?: addresses.firstOrNull()?.id
            _state.value = CheckoutUiState.Ready(
                addresses = addresses,
                selectedId = selectedId,
                // Prefilled from the pre-selected address's saved default.
                instructions = InstructionsDraft.from(addresses.firstOrNull { it.id == selectedId }?.defaultInstructions),
            )
            if (selectedId != null) refreshQuote(selectedId)
        }
    }

    /** Switch the shipping address. Per-order only — never changes the saved default. */
    fun select(id: String) {
        val s = ready() ?: return
        if (s.selectedId == id) return
        // A new address re-prices delivery, and a window belongs to the address it was quoted
        // for — nothing chosen for one address is carried to another.
        _state.value = s.copy(
            selectedId = id,
            quote = null,
            window = null,
            asap = false,
            error = null,
            // Replaced by the new address's saved instructions, even over something the
            // shopper typed. A note is about a place — "use the side gate" carried to another building
            // is worse than an empty field.
            instructions = InstructionsDraft.from(s.addresses.firstOrNull { it.id == id }?.defaultInstructions),
            saveInstructions = false,
        )
        refreshQuote(id)
    }

    // Delivery instructions

    fun setInstructions(draft: InstructionsDraft) {
        val s = ready() ?: return
        _state.value = s.copy(instructions = draft, error = null)
    }

    /** Switch "Use my points" on or off. */
    fun setUsePoints(on: Boolean) {
        val s = ready() ?: return
        _state.value = s.copy(usePoints = on, error = null)
    }

    /** The screen has opened the receipt for a points-paid order. */
    fun placedConsumed() {
        val s = ready() ?: return
        if (s.placedWithPoints == null) return
        _state.value = s.copy(placedWithPoints = null)
    }

    fun setSaveInstructions(save: Boolean) {
        val s = ready() ?: return
        _state.value = s.copy(saveInstructions = save)
    }

    /** Choose the one window for the order. Ignored unless the quote offers it on that day. */
    fun setWindow(slotId: String, date: String) {
        val s = ready() ?: return
        val chosen = ChosenWindow(slotId, date)
        if (s.effyWindows?.find(chosen) == null) return
        // A window un-chooses "as soon as possible".
        _state.value = s.copy(window = chosen, asap = false, error = null)
    }

    /**
     * A day that cannot be bought without a time was tapped: nothing is chosen until a time is.
     * Also how the time option is closed on a day that has no Any time window left.
     */
    fun clearWindow() {
        val s = ready() ?: return
        _state.value = s.copy(window = null, asap = false)
    }

    /** "as soon as possible": no day, no time. Ignored unless the quote offers it. */
    fun setAsap() {
        val s = ready() ?: return
        if (s.effyWindows?.asap == null) return
        _state.value = s.copy(window = null, asap = true, error = null)
    }

    /**
     * Fold a new quote into state, keeping the window only while it is still on offer.
     *
     * A window that has gone is not replaced. Nothing is selected and the shopper chooses again
     * .
     */
    private fun CheckoutUiState.Ready.withQuote(q: DeliveryQuote?): CheckoutUiState.Ready = copy(
        quote = q,
        quoting = false,
        window = window?.takeIf { q?.effyWindows?.find(it) != null },
        asap = asap && q?.effyWindows?.asap != null,
    )

    /**
     * Fetch the delivery quote for [addressId] and fold it into state. A stale response for an
     * address the shopper has since moved past is discarded (the selected id no longer matches).
     */
    private fun refreshQuote(addressId: String) {
        _state.value = (ready() ?: return).copy(quoting = true)
        viewModelScope.launch {
            val q = runCatching { quoteDelivery(addressId) }.getOrNull()
            val cur = ready() ?: return@launch
            if (cur.selectedId != addressId) return@launch // moved on — ignore this answer
            _state.value = cur.withQuote(q)
        }
    }

    // Billing

    /** Toggle "Billing same as shipping". Turning it back ON discards the divergent choice. */
    fun setBillingSameAsShipping(same: Boolean) {
        val s = ready() ?: return
        _state.value = s.copy(
            billingSameAsShipping = same,
            billingSelectedId = if (same) null else s.billingSelectedId,
            error = null,
        )
    }

    /** Choose a saved address as the divergent billing address. */
    fun selectBilling(id: String) {
        val s = ready() ?: return
        _state.value = s.copy(billingSelectedId = id, error = null)
    }

    // Add a new address inline — reuses the 022 form + edge create

    fun openAddAddress(target: AddressTarget) {
        val s = ready() ?: return
        _state.value = s.copy(sheet = CheckoutAddressSheet(target = target))
    }

    fun onSheetFormChange(form: AddressForm) {
        val s = ready() ?: return
        val sheet = s.sheet ?: return
        _state.value = s.copy(sheet = sheet.copy(form = form, fieldErrors = emptyMap()))
    }

    /** Dismissing the sheet mid-entry saves nothing. */
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
        // A divergent billing address must be chosen before paying.
        if (!s.billingSameAsShipping && s.billingSelectedId == null) {
            _state.value = s.copy(error = "Choose a billing address."); return
        }
        // Never let a shopper pay for an address we can't deliver to.
        if (!s.serviced) {
            _state.value = s.copy(error = CoverageWords.REFUSAL); return
        }
        // A same-day order needs a slot. The server refuses it regardless (`slot_required`);
        // this only tells the shopper before the round trip.
        if (!s.deliveryChosen) {
            _state.value = s.copy(
                error = if (s.effyWindows?.unavailable != null) DeliveryWindowWords.NO_WINDOWS else "Choose a delivery time to continue.",
            )
            return
        }
        val order = PlaceOrder(
            addressId = addressId,
            billingAddressId = s.effectiveBillingId,
            deliveryInstructions = s.instructions.toInstructions(),
            // One window for an Effy order; a courier order has nothing to choose.
            deliveryWindow = s.window.takeIf { s.courier == null && !s.asap },
            // "as soon as possible", sent instead of a window.
            asap = s.courier == null && s.asap,
            // Who delivers, as this screen shows it. The server refuses a mismatch, unpaid.
            deliveryType = s.quote?.deliveryType,
            // "the most I can": the balance. If that is more than the order needs, the server says
            // so with the most it will take, and that is sent instead (below).
            pointsToUse = if (s.usePoints) s.points?.usable ?: 0 else 0,
            // The delivery total on screen. A different one at the server is refused unpaid.
            shownDeliveryAmount = s.deliveryFee?.totalAmount,
        )
        _state.value = s.copy(paying = true, error = null)
        viewModelScope.launch {
            // This creates the intent and stops. It used to create it and present the provider's modal
            // sheet and confirm the order, because the sheet was something the app asked for rather than
            // something it drew. The in-app element is drawn by Effy's own payment screen, so the intent
            // has to exist before that screen does — and the confirmation belongs to the pay button on it.
            val intent = try {
                try {
                    createIntent(order)
                } catch (tooMany: PointsRefused) {
                    // The balance is more than this order needs (or would leave the card less than
                    // it can be charged). The shopper asked for "the most they can", and the server has
                    // just said what that is: ask once more with exactly that. Anything else is refused.
                    val max = tooMany.maxPoints
                    if (max == null || tooMany.reason == PointsRefusal.BalanceChanged || tooMany.reason == PointsRefusal.PaymentInProgress) throw tooMany
                    createIntent(order.copy(pointsToUse = max))
                }
            } catch (e: CancellationException) {
                throw e
            } catch (refused: PointsRefused) {
                val cur = ready() ?: return@launch
                _state.value = cur.copy(
                    paying = false,
                    error = when (refused.reason) {
                        PointsRefusal.BalanceChanged -> "Your points balance has changed. We’ve updated it — check and pay again."
                        PointsRefusal.PaymentInProgress -> "A payment for this order is already in progress. Check your orders before trying again."
                        else -> "We couldn’t apply your points to this order. Try again, or switch points off."
                    },
                )
                if (refused.reason == PointsRefusal.BalanceChanged) refreshQuote(addressId)
                return@launch
            } catch (changed: PromotionsChanged) {
                // An offer changed or its last use went. Nothing was charged; the shopper checks
                // the new total and pays again.
                val cur = ready() ?: return@launch
                _state.value = cur.copy(paying = false, error = "One of your offers changed or is no longer available. Check your new total before you pay.")
                refreshQuote(addressId)
                return@launch
            } catch (changed: DeliveryFeeChanged) {
                // The delivery total moved between the quote and the pay button. Nothing was
                // charged. The new total is shown and the shopper presses pay again.
                val cur = ready() ?: return@launch
                _state.value = cur.withQuote(changed.quote ?: cur.quote).copy(paying = false, error = DeliveryFeeWords.FEE_CHANGED)
                if (changed.quote == null) refreshQuote(addressId)
                return@launch
            } catch (refused: DeliveryChoiceRefused) {
                // The window could not be honoured. Nothing has been charged and no payment
                // exists. The choice is not replaced: the shopper is told, shown what is on offer
                // now, and chooses again.
                val cur = ready() ?: return@launch
                // The window is dropped whenever the refusal is about it, and never replaced — and
                // when who delivers has changed: nothing chosen for the old answer is kept.
                val cleared = if (refused.reason == DeliveryChoiceRefusal.SlotRequired) cur else cur.copy(window = null, asap = false)
                _state.value = cleared.withQuote(refused.quote ?: cur.quote).copy(
                    paying = false,
                    error = when (refused.reason) {
                        DeliveryChoiceRefusal.SlotUnavailable -> "That delivery time is no longer available. Please choose another."
                        DeliveryChoiceRefusal.SlotRequired -> "Choose a delivery time to continue."
                        DeliveryChoiceRefusal.DateUnavailable -> "That delivery day is no longer available. Please choose another."
                        DeliveryChoiceRefusal.NoWindowsAvailable -> DeliveryWindowWords.NO_WINDOWS
                        DeliveryChoiceRefusal.DeliveryTypeChanged -> DeliveryTypeWords.TYPE_CHANGED
                    },
                )
                // The server sends the fresh options with the refusal; without them, ask.
                if (refused.quote == null) refreshQuote(addressId)
                return@launch
            } catch (_: Throwable) {
                _state.value = (ready() ?: return@launch).copy(
                    paying = false,
                    error = "We couldn’t start payment. Please try again.",
                )
                return@launch
            }
            // Only when asked, and only after the order accepted the instructions: a refused
            // note must not become an address's default. Best-effort: the order already has them, so a
            // failure here costs some retyping next time and must not stand between a shopper and paying.
            if (s.saveInstructions && s.instructionsDiffer) {
                runCatching { saveAddressInstructions(addressId, s.instructions) }.getOrNull()?.let { saved ->
                    val cur = ready() ?: return@launch
                    _state.value = cur.copy(
                        addresses = cur.addresses.map { if (it.id == saved.id) saved else it },
                        saveInstructions = false,
                    )
                }
            }
            // Points paid for everything: the order is placed. Straight to its receipt; no payment screen.
            if (intent.paidWithPoints) {
                _state.value = (ready() ?: return@launch).copy(paying = false, placedWithPoints = intent.orderId)
                return@launch
            }
            // In memory only, never in the route — the intent carries a payment client secret.
            handoff.offer(intent)
            _state.value = (ready() ?: return@launch).copy(paying = false, handedOffToPayment = true)
        }
    }

    /** The screen has opened the payment destination; disarm the one-shot so returning is stable. */
    fun handoffConsumed() {
        val s = ready() ?: return
        if (!s.handedOffToPayment) return
        _state.value = s.copy(handedOffToPayment = false)
    }

    private fun ready(): CheckoutUiState.Ready? = _state.value as? CheckoutUiState.Ready

}
