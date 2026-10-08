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
    Text("Delivery", style = MaterialTheme.typography.titleSmall)

    val quote = s.quote
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
        else -> {
            if (s.sameDayOfferable) {
                DeliveryOptionRow(
                    label = "Same-day delivery",
                    fee = quote.sameDayTotalAmount ?: quote.standardTotalAmount,
                    selected = s.method == DeliveryMethod.SAME_DAY,
                    onSelect = { vm.setMethod(DeliveryMethod.SAME_DAY) },
                )
                DeliveryOptionRow(
                    label = "Standard delivery",
                    fee = quote.standardTotalAmount,
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
                val slotFee = quote.sameDayPartAmount ?: quote.sameDayTotalAmount ?: quote.standardTotalAmount
                FlowRow(
                    modifier = Modifier.fillMaxWidth().selectableGroup(),
                    horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
                ) {
                    quote.slots.forEach { slot ->
                        val label = DeliveryWindowText.formatWindow(slot.startAt, slot.endAt) ?: slot.date
                        FilterChip(
                            selected = slot.id == s.slotId,
                            onClick = { vm.setSlot(slot.id) },
                            label = { Text("Today, $label · $$slotFee") },
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
                val dayFee = if (s.needsSlot) quote.standardPartAmount ?: quote.standardTotalAmount else quote.standardTotalAmount
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
                    Text("$${quote.standardTotalAmount}", style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}

@OptIn(kotlin.time.ExperimentalTime::class)
private fun nowEpochMillis(): Long = kotlin.time.Clock.System.now().toEpochMilliseconds()

@Composable
private fun DeliveryOptionRow(label: String, fee: String, selected: Boolean, onSelect: () -> Unit) {
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
        Text("$$fee", style = MaterialTheme.typography.bodyMedium)
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
