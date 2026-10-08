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
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryMethod
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
        /**
         * 051 — a ONE-SHOT signal that the intent exists and the payment screen should open. Consumed
         * by the screen via [CheckoutViewModel.handoffConsumed].
         *
         * ⚠ A one-shot, and not a terminal `Placed`-style state, because payment is now a screen the
         * shopper can come BACK from. A sticky flag would re-fire the moment they returned and bounce
         * them into payment again, with no way out but the app switcher.
         */
        val handedOffToPayment: Boolean = false,
        // 047: the delivery quote for the selected address (null while none/loading), whether it is being
        // fetched, and the shopper's method choice. serviced=false ⇒ "we don't deliver there yet".
        val quote: DeliveryQuote? = null,
        val quoting: Boolean = false,
        val method: DeliveryMethod = DeliveryMethod.STANDARD,
        /**
         * 069 — WHEN. ⚠ A same-day slot is never selected for the shopper (FR-006): a window is a
         * promise about when someone will be home. A standard day defaults to the earliest (FR-015).
         * Both live here so they survive the hand-off to payment and a failed payment (FR-007).
         */
        val slotId: String? = null,
        val standardDate: String? = null,
        /**
         * 066 — what the shopper tells the driver. Starts from the selected address's SAVED default and
         * lives HERE, not in the control, so it survives the hand-off to payment and a failed payment.
         */
        val instructions: InstructionsDraft = InstructionsDraft(),
        /**
         * 066 — "save to this address". ⚠ OFF by default and reset whenever the address changes:
         * editing instructions for ONE order must never rewrite the saved default unasked (FR-014).
         */
        val saveInstructions: Boolean = false,
        /** 074 — pay with points? ON by default whenever the shopper has some (FR-012: the most they can). */
        val usePoints: Boolean = true,
        /**
         * 074 — a ONE-SHOT: points paid for the whole order, which is ALREADY PLACED. The screen opens
         * its receipt and disarms this via [CheckoutViewModel.placedConsumed].
         */
        val placedWithPoints: String? = null,
    ) : CheckoutUiState {
        /** 074 — the points control is shown only when the quote says the shopper has points. */
        val points get() = quote?.points?.takeIf { serviced }

        /** What the selected address has saved — to tell "using my default" from "changed for this order". */
        val savedInstructions: InstructionsDraft
            get() = InstructionsDraft.from(addresses.firstOrNull { it.id == selectedId }?.defaultInstructions)

        /** The save choice is offered only when there is something the address does not already hold. */
        val instructionsDiffer: Boolean get() = !instructions.sameAs(savedInstructions)

        /** The billing id to SEND (023): only when diverged AND different from shipping; else null. */
        val effectiveBillingId: String?
            get() = billingSelectedId?.takeIf { !billingSameAsShipping && it != selectedId }

        /** Serviced ⇔ a quote came back for a served address. Pay is blocked otherwise (047 FR-002). */
        val serviced: Boolean get() = quote?.serviced == true

        /** Same-day is choosable when any delivery can go today and a slot is open (069 research R7). */
        val sameDayOfferable: Boolean get() = quote?.sameDayAvailable == true

        private val sameDayChosen: Boolean get() = method == DeliveryMethod.SAME_DAY && sameDayOfferable

        /** A slot must be chosen: same-day was picked. */
        val needsSlot: Boolean get() = sameDayChosen

        /**
         * A day must be chosen: something goes standard, and the server offered days. ⚠ False against
         * a server older than 069, which sends none and defaults the day itself — blocking the pay
         * button on a choice nobody was shown would stop every checkout between the two deploys.
         */
        val needsDay: Boolean
            get() = quote?.standardDays?.isNotEmpty() == true && (!sameDayChosen || quote.mixed)

        /** Every delivery choice this order needs has been made. */
        val deliveryChosen: Boolean
            get() = (!needsSlot || slotId != null) && (!needsDay || standardDate != null)
    }

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
            // ⚠ 027: the checkout-entry cart snapshot is GONE. Under 019's Option B the device cart was
            // the source of truth, so checkout had to push it to the server before quoting. The platform
            // is authoritative now (research R0), which means checkout reads the SAME cart every other
            // surface reads — and keeping a snapshot here would give checkout a second source of truth,
            // which is precisely the 2026-07-23 bug family under a new name.
            val addresses = runCatching { listAddresses() }.getOrDefault(emptyList())
            // Pre-select the default; deterministic to the first saved address when none is default (FR-002).
            val selectedId = addresses.firstOrNull { it.isDefault }?.id ?: addresses.firstOrNull()?.id
            _state.value = CheckoutUiState.Ready(
                addresses = addresses,
                selectedId = selectedId,
                // 066 — prefilled from the pre-selected address's saved default (FR-013).
                instructions = InstructionsDraft.from(addresses.firstOrNull { it.id == selectedId }?.defaultInstructions),
            )
            if (selectedId != null) refreshQuote(selectedId)
        }
    }

    /** Switch the SHIPPING address (023 US2). Per-order only — never changes the saved default (FR-006). */
    fun select(id: String) {
        val s = ready() ?: return
        if (s.selectedId == id) return
        // A new address re-prices delivery (FR-004): reset the method to standard until the quote returns.
        _state.value = s.copy(
            selectedId = id,
            quote = null,
            method = DeliveryMethod.STANDARD,
            // 069: a slot belongs to the address it was quoted for; the day is re-defaulted by the quote.
            slotId = null,
            error = null,
            // ⚠ 066 FR-015: REPLACED by the new address's saved instructions, even over something the
            // shopper typed. A note is about a place — "use the side gate" carried to another building
            // is worse than an empty field.
            instructions = InstructionsDraft.from(s.addresses.firstOrNull { it.id == id }?.defaultInstructions),
            saveInstructions = false,
        )
        refreshQuote(id)
    }

    // ── Delivery instructions (066) ──────────────────────────────────────────────────────────────────

    fun setInstructions(draft: InstructionsDraft) {
        val s = ready() ?: return
        _state.value = s.copy(instructions = draft, error = null)
    }

    /** 074 — switch "Use my points" on or off. */
    fun setUsePoints(on: Boolean) {
        val s = ready() ?: return
        _state.value = s.copy(usePoints = on, error = null)
    }

    /** 074 — the screen has opened the receipt for a points-paid order. */
    fun placedConsumed() {
        val s = ready() ?: return
        if (s.placedWithPoints == null) return
        _state.value = s.copy(placedWithPoints = null)
    }

    fun setSaveInstructions(save: Boolean) {
        val s = ready() ?: return
        _state.value = s.copy(saveInstructions = save)
    }

    /** Choose standard vs same-day (047 US2). Only meaningful when same-day is on offer. */
    fun setMethod(method: DeliveryMethod) {
        val s = ready() ?: return
        if (method == DeliveryMethod.SAME_DAY && !s.sameDayOfferable) return
        _state.value = s.copy(method = method, error = null)
    }

    /** Choose a same-day slot (069). Ignored unless it is one the quote offers. */
    fun setSlot(slotId: String) {
        val s = ready() ?: return
        if (s.quote?.slots?.none { it.id == slotId } != false) return
        _state.value = s.copy(slotId = slotId, error = null)
    }

    /** Choose the standard delivery day (069). Ignored unless it is one the quote offers. */
    fun setStandardDate(date: String) {
        val s = ready() ?: return
        if (s.quote?.standardDays?.contains(date) != true) return
        _state.value = s.copy(standardDate = date, error = null)
    }

    /**
     * Fold a new quote into state, keeping a choice only while it is still on offer (069).
     *
     * ⚠ A SLOT THAT HAS GONE IS NOT REPLACED. Nothing is selected and the shopper chooses again
     * (FR-010). A standard day falls back to the earliest, which is the default they would have been
     * shown anyway (FR-015).
     */
    private fun CheckoutUiState.Ready.withQuote(q: DeliveryQuote?): CheckoutUiState.Ready = copy(
        quote = q,
        quoting = false,
        method = if (q?.sameDayAvailable == true) method else DeliveryMethod.STANDARD,
        slotId = slotId?.takeIf { id -> q?.slots?.any { it.id == id } == true },
        standardDate = standardDate?.takeIf { q?.standardDays?.contains(it) == true } ?: q?.standardDays?.firstOrNull(),
    )

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
            _state.value = cur.withQuote(q)
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
            _state.value = s.copy(error = CoverageWords.REFUSAL); return
        }
        // 069: a same-day order needs a slot. ⚠ The server refuses it regardless (`slot_required`);
        // this only tells the shopper before the round trip.
        if (!s.deliveryChosen) {
            _state.value = s.copy(
                error = if (s.needsSlot && s.slotId == null) "Choose a delivery time to continue." else "Choose a delivery day to continue.",
            )
            return
        }

        val order = PlaceOrder(
            addressId = addressId,
            billingAddressId = s.effectiveBillingId,
            deliveryMethod = s.method,
            deliveryInstructions = s.instructions.toInstructions(),
            sameDaySlotId = s.slotId.takeIf { s.needsSlot },
            standardDate = s.standardDate.takeIf { s.needsDay },
            // 074 — "the most I can": the balance. If that is more than the order needs, the server says
            // so with the most it will take, and that is sent instead (below).
            pointsToUse = if (s.usePoints) s.points?.usable ?: 0 else 0,
        )
        _state.value = s.copy(paying = true, error = null)
        viewModelScope.launch {
            // ⚠ THIS CREATES THE INTENT AND STOPS. It used to create it AND present the provider's modal
            // sheet AND confirm the order, because the sheet was something the app asked for rather than
            // something it drew. The in-app element is drawn by Effy's own payment screen, so the intent
            // has to exist before that screen does — and the confirmation belongs to the pay button on it.
            val intent = try {
                try {
                    createIntent(order)
                } catch (tooMany: PointsRefused) {
                    // 074 — the balance is more than this order needs (or would leave the card less than
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
            } catch (refused: DeliveryChoiceRefused) {
                // 069 — the slot or day could not be honoured. Nothing has been charged and no payment
                // exists. ⚠ The choice is NOT replaced: the shopper is told, shown what is on offer
                // now, and chooses again (FR-009, FR-010).
                val cur = ready() ?: return@launch
                val cleared = if (refused.reason == DeliveryChoiceRefusal.DateUnavailable) cur else cur.copy(slotId = null)
                _state.value = cleared.withQuote(refused.quote ?: cur.quote).copy(
                    paying = false,
                    error = when (refused.reason) {
                        DeliveryChoiceRefusal.SlotUnavailable -> "That delivery time is no longer available. Please choose another."
                        DeliveryChoiceRefusal.SlotRequired -> "Choose a delivery time to continue."
                        DeliveryChoiceRefusal.DateUnavailable -> "That delivery day is no longer available. Please choose another."
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
            // 066 FR-014 — ONLY when asked, and only AFTER the order accepted the instructions: a refused
            // note must not become an address's default. Best-effort: the ORDER already has them, so a
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
            // 074 — points paid for everything: the order is placed. Straight to its receipt; no payment screen.
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
