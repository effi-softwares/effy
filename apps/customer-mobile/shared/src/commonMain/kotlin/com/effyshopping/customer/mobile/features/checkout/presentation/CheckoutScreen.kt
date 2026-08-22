package com.effyshopping.customer.mobile.features.checkout.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
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
 * shipping" toggle (US4) → pay. On success [onPlaced] navigates to the receipt.
 */
@Composable
fun CheckoutScreen(container: AppContainer, onPlaced: (String) -> Unit, onBack: () -> Unit) {
    val vm = viewModel {
        CheckoutViewModel(
            cart = container.cart,
            listAddresses = container.listSavedAddresses,
            addAddress = container.addSavedAddress,
            pay = container.payForOrder,
            quoteDelivery = container.quoteDelivery,
        )
    }
    val state by vm.state.collectAsState()

    LaunchedEffect(state) {
        (state as? CheckoutUiState.Placed)?.let { onPlaced(it.orderId) }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        // 026: the app bar already names the screen — the duplicate H3 beneath it was the screen
        // saying "Checkout" twice, which the source never does.
        EffyAppBar(title = "Checkout", onBack = onBack)

        when (val s = state) {
            CheckoutUiState.Loading, is CheckoutUiState.Placed ->
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

        // 047: delivery — serviceability + the GST-inclusive fee, shown BEFORE pay (no drip), and the
        // standard/same-day choice when the whole order qualifies. The server owns every fee (SC-004).
        DeliverySection(s, vm)

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
 * Delivery (047): serviceability + fee + the standard/same-day choice. ⚠ No distance, ring, or shop is
 * ever shown (FR-018/033) — only the method and its GST-inclusive fee.
 */
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
        !quote.serviced -> Text(
            "We don’t deliver to this address yet. Choose another address above.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.error,
        )
        s.sameDayOfferable -> {
            // A whole-order choice (the shopper never sees packages). Fees update the row labels live.
            DeliveryOptionRow(
                label = "Standard delivery",
                fee = quote.standardTotalAmount,
                selected = s.method == DeliveryMethod.STANDARD,
                onSelect = { vm.setMethod(DeliveryMethod.STANDARD) },
            )
            DeliveryOptionRow(
                label = "Same-day delivery",
                fee = quote.sameDayTotalAmount ?: quote.standardTotalAmount,
                selected = s.method == DeliveryMethod.SAME_DAY,
                onSelect = { vm.setMethod(DeliveryMethod.SAME_DAY) },
            )
        }
        else -> {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("Standard delivery", style = MaterialTheme.typography.bodyMedium)
                Text("$${quote.standardTotalAmount}", style = MaterialTheme.typography.bodyMedium)
            }
            // 047: say when same-day isn't available, rather than silently omitting it.
            Text(
                "Same-day delivery isn’t available for this address.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun DeliveryOptionRow(label: String, fee: String, selected: Boolean, onSelect: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            RadioButton(selected = selected, onClick = onSelect)
            Text(label, style = MaterialTheme.typography.bodyMedium)
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
