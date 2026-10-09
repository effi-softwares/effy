package com.effyshopping.customer.mobile.features.checkout.presentation

import com.effyshopping.customer.mobile.core.delivery.CoverageWords
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.FilterChip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.effyshopping.customer.mobile.features.checkout.domain.ChosenWindow
import com.effyshopping.customer.mobile.features.checkout.domain.CourierDelivery
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryType
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryFee
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryWindowText
import com.effyshopping.customer.mobile.features.checkout.domain.SameDayUnavailable
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.toggleable
import com.effyshopping.customer.mobile.features.deliveryinstructions.presentation.DeliveryInstructionsField
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import com.effyshopping.customer.mobile.core.nav.CustomerNavKey
import com.effyshopping.customer.mobile.features.legal.presentation.LegalLinksText
import com.effyshopping.customer.mobile.core.presentation.EffyAppBar
import com.effyshopping.customer.mobile.core.presentation.EffySecondaryButton
import com.effyshopping.customer.mobile.core.presentation.EffyDetailRow
import com.effyshopping.customer.mobile.core.presentation.EffyHairline
import com.effyshopping.mobile.design.EffySpacing
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.ic_arrow_back
import com.effyshopping.mobile.kit.ui.EffyPrimaryAction
import com.effyshopping.mobile.kit.ui.EffyTopBar
import org.jetbrains.compose.resources.painterResource
import com.effyshopping.customer.mobile.features.addresses.domain.SavedAddress
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryMethod
import com.effyshopping.customer.mobile.features.addresses.presentation.AddressFormSheet
import com.effyshopping.customer.mobile.features.cart.domain.formatCents
import com.effyshopping.customer.mobile.features.cart.domain.parseCents
import com.effyshopping.customer.mobile.core.presentation.EffySheet

/**
 * Checkout (019 US3, extended 021 delivery + 023 shipping/billing). Reached only when signed in.
 * Pre-selects the default saved address as SHIPPING (023 US1), lets the customer switch to another saved
 * address or add a new one inline (US2/US3) → per-package ANONYMOUS delivery options → a "Billing same as
 * shipping" toggle (US4) → pay.
 *
 * ⚠ 051: THIS SCREEN NO LONGER TAKES A PAYMENT. Pressing pay creates the order and its intent and then
 * hands over to Effy's own payment screen through [onProceedToPayment]; the provider's modal sheet is
 * gone. Checkout ends unpaid, which is why there is no receipt callback here any more.
 */
@Composable
fun CheckoutScreen(
    container: AppContainer,
    onProceedToPayment: () -> Unit,
    onBack: () -> Unit,
    /** 074 — points paid for everything; the order is placed. Open its receipt. */
    onPlacedWithPoints: (orderId: String) -> Unit = {},
) {
    val vm = viewModel {
        CheckoutViewModel(
            listAddresses = container.listSavedAddresses,
            addAddress = container.addSavedAddress,
            createIntent = container.createIntent,
            handoff = container.paymentHandoff,
            quoteDelivery = container.quoteDelivery,
            saveAddressInstructions = container.saveAddressInstructions,
        )
    }
    val state by vm.state.collectAsState()

    val handedOff = (state as? CheckoutUiState.Ready)?.handedOffToPayment == true
    LaunchedEffect(handedOff) {
        if (handedOff) {
            // Disarm FIRST. Navigating first and disarming second leaves the flag set for however long
            // the transition takes, and a shopper who backs out inside that window is sent straight back.
            vm.handoffConsumed()
            onProceedToPayment()
        }
    }

    val placed = (state as? CheckoutUiState.Ready)?.placedWithPoints
    LaunchedEffect(placed) {
        if (placed != null) {
            vm.placedConsumed()
            onPlacedWithPoints(placed)
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        // 026: the app bar already names the screen — the duplicate H3 beneath it was the screen
        // saying "Checkout" twice, which the source never does.
        EffyAppBar(title = "Checkout", onBack = onBack)

        when (val s = state) {
            CheckoutUiState.Loading ->
                Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) { CircularProgressIndicator(Modifier.padding(32.dp)) }

            is CheckoutUiState.Ready -> AddressAndPay(
                s,
                vm,
                onNavigateLegal = { container.navigator.push(CustomerNavKey.LegalDocument(it)) },
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddressAndPay(s: CheckoutUiState.Ready, vm: CheckoutViewModel, onNavigateLegal: (String) -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(EffySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(EffySpacing.md),
    ) {
        Text("Delivery address", style = MaterialTheme.typography.titleMedium)
        if (s.addresses.isEmpty()) {
            // No saved address → a prompt that blocks pay (023 US1 scenario 3, FR-007).
            Text(
                "Add a delivery address to continue.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            // Picker: the saved addresses as selectable rows (no cards — FR-022); the selected one shown.
            s.addresses.forEach { addr ->
                AddressPickRow(addr, selected = addr.id == s.selectedId, onSelect = { vm.select(addr.id) })
            }
        }
        EffySecondaryButton("Add a new address", onClick = { vm.openAddAddress(AddressTarget.SHIPPING) })

        // 066 — what the shopper tells the driver. Shown once there is an address for it to be about.
        if (s.selectedId != null) {
            DeliveryInstructionsField(draft = s.instructions, onChange = vm::setInstructions)
            // Offered only when there is something new to save — an always-present switch is a chore.
            if (s.instructionsDiffer) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .toggleable(
                            value = s.saveInstructions,
                            role = Role.Checkbox,
                            onValueChange = vm::setSaveInstructions,
                        ),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(checked = s.saveInstructions, onCheckedChange = null)
                    Spacer(Modifier.width(EffySpacing.s))
                    Text("Save to this address for next time", style = MaterialTheme.typography.bodyMedium)
                }
            }
        }

        // 047: delivery — serviceability + the GST-inclusive fee, shown BEFORE pay (no drip), and the
        // standard/same-day choice when the whole order qualifies. The server owns every fee (SC-004).
        DeliverySection(s, vm)

        // 074 — Effy points, only when the shopper has some.
        s.points?.let { points ->
            HorizontalDivider()
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp)
                    .toggleable(value = s.usePoints, role = Role.Switch, onValueChange = vm::setUsePoints),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text("Use my Effy points", style = MaterialTheme.typography.bodyLarge)
                    Text(
                        "${formatPointsCount(points.usable)} points, worth \$${points.valueAmount}. Any rest is paid by card.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(checked = s.usePoints, onCheckedChange = null)
            }
        }

        BillingSection(s, vm)

        s.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }

        val billingReady = s.billingSameAsShipping || s.billingSelectedId != null
        // 047 FR-002: pay is blocked until delivery is confirmed for the address.
        val payEnabled = !s.paying && s.selectedId != null && billingReady && s.serviced
        EffyPrimaryAction(
            if (s.paying) "Processing…" else "Pay now",
            onClick = vm::payNow,
            enabled = payEnabled,
        )
        // Point-of-sale consent (045) — the purchase terms, at the moment of paying.
        LegalLinksText(
            "By placing your order you agree to our [Terms of Service](/legal/terms-of-service), " +
                "[Delivery Policy](/legal/delivery-policy) and [Refund & Returns Policy](/legal/refunds-returns).",
            onNavigateSlug = onNavigateLegal,
        )
    }

    // The shared add-address form (022) — raised for shipping OR billing (023 US3).
    // ⚠ 034 — on the SHARED EffySheet now, which owns the title and the Save/Cancel pair. This was
    // the last hand-rolled ModalBottomSheet in the app; leaving it would have meant checkout's form
    // looking like a different component from the identical one in the address book.
    s.sheet?.let { sheet ->
        EffySheet(
            title = "Add an address",
            onDismiss = vm::dismissSheet,
            primaryLabel = "Add",
            onPrimary = vm::submitAddress,
            primaryEnabled = !sheet.saving,
        ) {
            AddressFormSheet(
                form = sheet.form,
                fieldErrors = sheet.fieldErrors,
                onChange = vm::onSheetFormChange,
            )
        }
    }
}

/**
 * Delivery (047; 069): serviceability, the standard/same-day choice, a time slot for same-day and a day
 * for standard. ⚠ No distance, ring, or shop is ever shown (FR-018/033).
 *
 * ⚠ NO SLOT IS SELECTED FOR THE SHOPPER (069 FR-006): a window is a promise about when someone will be
 * home. The standard day IS preselected — the earliest (FR-015).
 *
 * ⚠ EVERY OPTION SHOWS ITS FEE, AND THEY ARE ALL THE SAME FEE. A slot and a day have no price of their
 * own (FR-021); it is repeated so a shopper comparing slots can see the later one costs no more.
 *
 * A list and chips inside the section — no cards (Principle V).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DeliverySection(s: CheckoutUiState.Ready, vm: CheckoutViewModel) {
    if (s.selectedId == null) return
    HorizontalDivider()
    val quote = s.quote
    // 079 — the section is headed by WHO DELIVERS, once the quote says: "Courier delivery", or
    // "Delivered by Effy" under the new delivery model. Plain "Delivery" while it is loading, when
    // nobody delivers, and under the checkout that predates delivery types.
    Text(
        when (quote?.takeUnless { s.quoting }?.deliveryType) {
            DeliveryType.COURIER -> DeliveryTypeWords.COURIER
            DeliveryType.EFFY -> DeliveryTypeWords.EFFY
            null -> "Delivery"
        },
        style = MaterialTheme.typography.titleSmall,
    )

    when {
        s.quoting || quote == null -> Text(
            "Checking delivery…",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        // 076 — the ONE refusal sentence (CoverageWords), the same the address book shows.
        !quote.serviced -> Text(
            CoverageWords.REFUSAL,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.error,
        )
        // 079 — a courier delivers: NOTHING TO CHOOSE. Before the pickers — a courier quote carries no
        // windows, slots or days, and the branches below would draw an empty section for it.
        quote.courier != null -> {
            CourierSection(quote.courier)
            DeliveryFeeSummary(quote.courier.fee, quote.freeDeliveryRemainingAmount)
        }
        // 078 — WHICH CHECKOUT THIS IS, THE QUOTE SAYS. With windows the shopper picks ONE for the
        // order; everything below this branch is the 069 method / slot / day picker.
        quote.effyWindows != null -> {
            EffyWindowsSection(
                view = effyWindowsView(quote.effyWindows, nowEpochMillis()),
                chosen = s.window,
                enabled = !s.paying,
                onChoose = vm::setWindow,
            )
            s.deliveryFee?.let { fee -> DeliveryFeeSummary(fee, quote.freeDeliveryRemainingAmount) }
        }
        else -> {
            // 077 — ONE fee for the order: a later day's, or the chosen window's. Same-day is shown
            // "from" its cheapest window when the windows differ, so its price is never understated.
            val standardTotal = quote.standardFee?.totalAmount ?: quote.standardTotalAmount
            val windowTotals = quote.slots.mapNotNull { it.fee?.totalAmount }
            val sameDayFrom = windowTotals.minByOrNull { it.toDoubleOrNull() ?: 0.0 } ?: quote.sameDayTotalAmount ?: standardTotal
            if (s.sameDayOfferable) {
                DeliveryOptionRow(
                    label = "Same-day delivery",
                    fee = if (windowTotals.distinct().size > 1) "from \$$sameDayFrom" else "\$$sameDayFrom",
                    selected = s.method == DeliveryMethod.SAME_DAY,
                    onSelect = { vm.setMethod(DeliveryMethod.SAME_DAY) },
                )
                DeliveryOptionRow(
                    label = "Standard delivery",
                    fee = "\$$standardTotal",
                    selected = s.method == DeliveryMethod.STANDARD,
                    onSelect = { vm.setMethod(DeliveryMethod.STANDARD) },
                )
            } else {
                // ⚠ TWO DIFFERENT SENTENCES (FR-004). "Not in your area" will still be true tomorrow;
                // "today's times are taken" will not.
                Text(
                    if (quote.sameDayUnavailable == SameDayUnavailable.SlotsClosed) {
                        "Today’s same-day delivery times are closed or full. Standard delivery is available."
                    } else {
                        "Same-day delivery isn’t available for this address."
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            if (s.needsSlot) {
                Text("Choose a delivery time", style = MaterialTheme.typography.labelLarge)
                if (quote.mixed) {
                    Text(
                        "${quote.sameDayDeliveries} of your ${quote.deliveries} deliveries can arrive today.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                FlowRow(
                    modifier = Modifier.fillMaxWidth().selectableGroup(),
                    horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
                ) {
                    quote.slots.forEach { slot ->
                        val label = DeliveryWindowText.formatWindow(slot.startAt, slot.endAt) ?: slot.date
                        FilterChip(
                            selected = slot.id == s.slotId,
                            onClick = { vm.setSlot(slot.id) },
                            // 077 FR-030 — what this window ADDS, before it is chosen; else its fee.
                            label = {
                                val surcharge = slot.surchargeAmount?.takeIf { (it.toDoubleOrNull() ?: 0.0) > 0.0 }
                                Text(if (surcharge != null) "Today, $label · +$$surcharge" else "Today, $label · $${slot.fee?.totalAmount ?: sameDayFrom}")
                            },
                            // ⚠ 48dp: a fat-finger target, and the difference between two adjacent
                            // windows is exactly the mistake a small chip invites.
                            modifier = Modifier.heightIn(min = 48.dp).semantics { role = Role.RadioButton },
                        )
                    }
                }
            }

            if (s.needsDay) {
                Text(
                    if (quote.mixed && s.needsSlot) "Choose a day for the rest" else "Choose a delivery day",
                    style = MaterialTheme.typography.labelLarge,
                )
                // 077 — a same-day order pays its window's fee; the rest arrives later at no extra
                // charge, so the days for it carry no price.
                val dayFee = if (s.needsSlot) null else "\$$standardTotal"
                val today = DeliveryWindowText.melbourneDay(nowEpochMillis())
                Column(modifier = Modifier.selectableGroup()) {
                    quote.standardDays.forEach { day ->
                        DeliveryOptionRow(
                            label = DeliveryWindowText.relativeDay(day, today),
                            fee = dayFee,
                            selected = day == s.standardDate,
                            onSelect = { vm.setStandardDate(day) },
                        )
                    }
                }
            } else if (!s.sameDayOfferable) {
                // A server older than 069 offers no days: the one standard fee, as before.
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Standard delivery", style = MaterialTheme.typography.bodyMedium)
                    Text("$$standardTotal", style = MaterialTheme.typography.bodyMedium)
                }
            }

            // 077 — what is charged for delivery, line by line, before Pay (FR-028), and how close
            // the basket is to free delivery (FR-029).
            s.deliveryFee?.let { fee -> DeliveryFeeSummary(fee, quote.freeDeliveryRemainingAmount) }
        }
    }
}

/**
 * The delivery-window picker of the new delivery model (078): ONE window for the whole order.
 *
 *   Same-day delivery   today's open windows, each with the time to order by;
 *   Standard delivery   the next delivery days as a strip, each with its own windows.
 *
 * ⚠ EVERY WORD IS `effyWindowsView`'S — the twin of the function the website renders, pinned to the
 * same fixture. This composable only lays the words out.
 * ⚠ NOTHING IS SELECTED FOR THE SHOPPER. The day strip only decides which day's windows are shown.
 * ⚠ ONE SELECTABLE GROUP across both sections: the order has one window.
 * ⚠ Rows and a strip — no cards. Every target is at least 48dp.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun EffyWindowsSection(
    view: EffyWindowsView,
    chosen: ChosenWindow?,
    enabled: Boolean,
    onChoose: (slotId: String, date: String) -> Unit,
) {
    view.unavailable?.let { sentence ->
        Text(sentence, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error)
        return
    }

    // Which later day is open: the one the shopper tapped, else the chosen window's, else the first with any.
    var tapped by remember { mutableStateOf<String?>(null) }
    val shown = view.later.firstOrNull { it.date == tapped }
        ?: view.later.firstOrNull { it.date == chosen?.date }
        ?: view.later.firstOrNull { it.windows.isNotEmpty() }
        ?: view.later.firstOrNull()

    Column(modifier = Modifier.selectableGroup(), verticalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
        view.today?.let { today ->
            Text(view.sameDayTitle, style = MaterialTheme.typography.labelLarge)
            EffyDayWindows(today, chosen, enabled, onChoose)
        }

        if (shown != null) {
            Text(view.standardTitle, style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = EffySpacing.s))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
                view.later.forEach { day ->
                    FilterChip(
                        selected = day.date == shown.date,
                        onClick = { tapped = day.date },
                        label = { Text(day.label) },
                        modifier = Modifier.heightIn(min = 48.dp).semantics { role = Role.Tab },
                    )
                }
            }
            EffyDayWindows(shown, chosen, enabled, onChoose)
        }
    }
}

@Composable
private fun EffyDayWindows(day: EffyDayView, chosen: ChosenWindow?, enabled: Boolean, onChoose: (String, String) -> Unit) {
    day.sentence?.let {
        Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    day.windows.forEach { w ->
        val selected = chosen?.slotId == w.slotId && chosen.date == w.date
        Row(
            // The WHOLE row is the target, announced as one radio button with its time and what it adds.
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .selectable(selected = selected, enabled = enabled && !w.closed, role = Role.RadioButton, onClick = { onChoose(w.slotId, w.date) }),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                RadioButton(selected = selected, onClick = null, enabled = enabled && !w.closed)
                Column(modifier = Modifier.padding(start = EffySpacing.s)) {
                    Text(w.label, style = MaterialTheme.typography.bodyMedium)
                    w.note?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
            }
            // 077 FR-030 — what this window adds, BEFORE it is chosen. Nothing when it adds nothing.
            w.surchargeAmount?.let { Text("+$$it", style = MaterialTheme.typography.bodyMedium) }
        }
    }
}

@OptIn(kotlin.time.ExperimentalTime::class)
private fun nowEpochMillis(): Long = kotlin.time.Clock.System.now().toEpochMilliseconds()

/**
 * 079 — the delivery section when a COURIER delivers the order: who, and roughly when.
 *
 * ⚠ THERE IS NOTHING TO CHOOSE, AND SO NOTHING TO TAP. No window, no day, no method — a disabled
 * picker would only suggest one was meant to be there.
 * ⚠ EVERY WORD IS [DeliveryTypeWords]' — the twin of what the website prints. The estimate is always
 * said AS an estimate.
 * ⚠ When the address IS one Effy delivers to and no window is left, the shopper is told that FIRST:
 * they were expecting a time to pick.
 * ⚠ Text in a column — no card (Principle V).
 */
@Composable
private fun CourierSection(courier: CourierDelivery) {
    val (partner, estimate) = DeliveryTypeWords.courierLines(courier.estimate)
    Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.xs)) {
        if (courier.noWindowLeft) {
            Text(
                "${DeliveryTypeWords.NO_WINDOWS_LEFT} ${DeliveryTypeWords.COURIER_INSTEAD_OF_WINDOWS}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
            )
        }
        Text(partner, style = MaterialTheme.typography.bodyMedium)
        Text(estimate, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** 077 — the delivery lines, in the shared words, and the free-delivery hint. A list, not a card. */
@Composable
private fun DeliveryFeeSummary(fee: DeliveryFee, freeRemaining: String?) {
    Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.xs)) {
        fee.lines.forEach { line ->
            val saving = line.amount.startsWith("-")
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(DeliveryFeeWords.label(line.kind), style = MaterialTheme.typography.bodyMedium)
                Text(
                    if (saving) "−$${line.amount.removePrefix("-")}" else "$${line.amount}",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
        when {
            fee.free -> Text(DeliveryFeeWords.FREE_REACHED, style = MaterialTheme.typography.bodySmall)
            freeRemaining != null -> Text(
                DeliveryFeeWords.spendMore("$$freeRemaining"),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun DeliveryOptionRow(label: String, fee: String?, selected: Boolean, onSelect: () -> Unit) {
    Row(
        // The WHOLE row is the target, announced as one radio button with its label and fee.
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .selectable(selected = selected, role = Role.RadioButton, onClick = onSelect),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            RadioButton(selected = selected, onClick = null)
            Text(label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(start = EffySpacing.s))
        }
        fee?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
    }
}

/** Billing address (023 US4): "same as shipping" toggle ON by default; OFF reveals the same picker. */
@Composable
private fun BillingSection(s: CheckoutUiState.Ready, vm: CheckoutViewModel) {
    HorizontalDivider()
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("Billing address same as shipping", style = MaterialTheme.typography.titleSmall)
        Switch(checked = s.billingSameAsShipping, onCheckedChange = vm::setBillingSameAsShipping)
    }
    if (!s.billingSameAsShipping) {
        if (s.addresses.isEmpty()) {
            Text(
                "Add a billing address to continue.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            s.addresses.forEach { addr ->
                AddressPickRow(addr, selected = addr.id == s.billingSelectedId, onSelect = { vm.selectBilling(addr.id) })
            }
        }
        EffySecondaryButton("Add a billing address", onClick = { vm.openAddAddress(AddressTarget.BILLING) })
    }
}

/** One selectable saved-address row (023) — a list, never a card (FR-022). Reused for shipping + billing. */
@Composable
private fun AddressPickRow(addr: SavedAddress, selected: Boolean, onSelect: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().selectable(selected = selected, onClick = onSelect).padding(vertical = 6.dp),
        verticalAlignment = Alignment.Top,
    ) {
        RadioButton(selected = selected, onClick = onSelect)
        Column {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(addr.recipientName, style = MaterialTheme.typography.bodyMedium)
                addr.label?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                }
                if (addr.isDefault) Text("Default", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(
                addr.formatSummary(),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private fun SavedAddress.formatSummary(): String = buildString {
    append(line1)
    line2?.takeIf { it.isNotBlank() }?.let { append(", ").append(it) }
    append(", ").append(city).append(" ").append(postalCode)
    append(", ").append(country)
}

/** "1,250" — grouped thousands. */
private fun formatPointsCount(n: Long): String = n.toString().reversed().chunked(3).joinToString(",").reversed()
