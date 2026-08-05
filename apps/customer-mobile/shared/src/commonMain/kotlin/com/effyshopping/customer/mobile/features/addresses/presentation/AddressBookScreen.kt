package com.effyshopping.customer.mobile.features.addresses.presentation

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import com.effyshopping.customer.mobile.core.presentation.EffyAppBar
import com.effyshopping.customer.mobile.core.presentation.EffyEmptyState
import com.effyshopping.mobile.design.EffySpacing
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.features.addresses.domain.SavedAddress
import androidx.compose.foundation.layout.navigationBarsPadding
import com.effyshopping.customer.mobile.core.presentation.EffyPrimaryButton
import com.effyshopping.customer.mobile.core.presentation.EffySheet
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.ui.draw.rotate
import com.effyshopping.customer.mobile.core.presentation.EffyHairline
import com.effyshopping.customer.mobile.core.presentation.EffyMinTouchTarget
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.ic_arrow_back
import org.jetbrains.compose.resources.painterResource
import androidx.compose.foundation.layout.size

/**
 * The address book (022). A LazyColumn of addresses (never cards — Principle V), the default clearly
 * marked, an empty state, and a FAB that raises the add form in a ModalBottomSheet. The row BODY opens
 * edit (a large forgiving target); "Set default" and "Delete" are distinct per-row controls (FR-017a).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddressBookScreen(container: AppContainer, onBack: () -> Unit) {
    val vm = viewModel {
        AddressBookViewModel(
            container.listSavedAddresses, container.addSavedAddress, container.updateSavedAddress,
            container.setDefaultAddress, container.deleteSavedAddress,
        )
    }
    val state by vm.state.collectAsState()

    // ⚠ 034 FR-032 — THE FLOATING ACTION BUTTON IS GONE, replaced by a bottom-anchored full-width
    // primary button. This AMENDS feature 022's FR-007, which mandated the FAB; the amendment is
    // recorded in 022's spec, not only here.
    //
    // Two reasons, and the second is the one that matters:
    //   1. A circular FAB OCCLUDES THE LAST ROW of a short list — exactly where a newly added
    //      address lands (FR-033). An address book is neither long nor scrolling; a FAB earns its
    //      keep on content-first feeds, not here.
    //   2. ⚠ A FAB is by construction the LOUDEST thing on the screen, and Baymard measured that
    //      nudging shoppers toward "Add" over "Edit" makes them ACCUMULATE STALE ADDRESSES and then
    //      pick the wrong one at checkout. On a delivery platform that is a mis-delivered order, not
    //      an untidy list. Edit must stay as reachable as Add (FR-035) — the row body is the edit
    //      target, and this button no longer out-shouts it.
    Scaffold(
        bottomBar = {
            Column(
                Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = EffySpacing.lg, vertical = EffySpacing.md),
            ) {
                EffyPrimaryButton(label = "Add address", onClick = { vm.openAdd() })
            }
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            // 026: the source's app bar — a real back affordance instead of a "Back" text button
            // floating opposite the title (025 FR-030 banned improvised text-link navigation, and
            // this screen was the last place one survived).
            EffyAppBar(title = "Address book", onBack = onBack)
            when {
                state.loading ->
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }

                state.addresses.isEmpty() -> EffyEmptyState(
                    title = "No saved addresses",
                    body = "Add a delivery address and it’ll be ready at checkout.",
                    actionLabel = "Add address",
                    onAction = { vm.openAdd() },
                )

                else ->
                    LazyColumn(Modifier.fillMaxSize()) {
                        state.error?.let { err ->
                            item {
                                Text(err, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(EffySpacing.lg))
                            }
                        }
                        items(state.addresses, key = { it.id }) { address ->
                            AddressRow(
                                address = address,
                                onEdit = { vm.openEdit(address.id) },
                                onSetDefault = { vm.makeDefault(address.id) },
                                onDelete = { vm.askDelete(address.id) },
                            )
                            EffyHairline()
                        }
                    }
            }
        }
    }

    // Add / edit form.
    state.sheet?.let { sheet ->
        // 034 T017 — on the SHARED EffySheet now, rather than a hand-rolled ModalBottomSheet with
        // its own state and padding. `dirty = false` deliberately: this form's draft already lives in
        // the ViewModel and survives dismissal, so the discard prompt would be asking about work that
        // is not actually lost. The single-field editors, whose value dies with the sheet, pass true.
        EffySheet(
            title = if (sheet.editingId != null) "Edit address" else "Add an address",
            onDismiss = { vm.dismissSheet() },
            primaryLabel = if (sheet.editingId != null) "Save" else "Add",
            onPrimary = { vm.submit() },
            primaryEnabled = !sheet.saving,
        ) {
            AddressFormSheet(
                form = sheet.form,
                fieldErrors = sheet.fieldErrors,
                onChange = vm::onFormChange,
            )
        }
    }

    // Confirm delete.
    state.pendingDeleteId?.let {
        AlertDialog(
            onDismissRequest = { vm.cancelDelete() },
            title = { Text("Delete this address?") },
            text = { Text("This won’t affect any past orders.") },
            confirmButton = { TextButton(onClick = { vm.confirmDelete() }) { Text("Delete") } },
            dismissButton = { TextButton(onClick = { vm.cancelDelete() }) { Text("Cancel") } },
        )
    }

    // Delete-default blocked (server 409): prompt to reassign first (FR-016a).
    if (state.reassignPrompt) {
        AlertDialog(
            onDismissRequest = { vm.dismissReassignPrompt() },
            title = { Text("Set another default first") },
            text = { Text("This is your default delivery address. Make another address the default, then delete this one.") },
            confirmButton = { TextButton(onClick = { vm.dismissReassignPrompt() }) { Text("Got it") } },
        )
    }
}

@Composable
private fun AddressRow(
    address: SavedAddress,
    onEdit: () -> Unit,
    onSetDefault: () -> Unit,
    onDelete: () -> Unit,
) {
    Column(Modifier.fillMaxWidth()) {
        // The row BODY is the edit affordance (022 FR-017a) — a big touch target.
        //
        // ⚠ 034 pass: it now carries a CHEVRON. The body has always been tappable and nothing said
        // so, which is the same gap the account centre's detail rows were built to close: an
        // affordance a shopper cannot see is one they do not use, and Baymard's finding is that when
        // Edit is hard to notice people press Add instead and accumulate stale addresses — which on a
        // delivery platform ends as a mis-delivered order, not an untidy list.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = EffyMinTouchTarget)
                .clickable(onClick = onEdit)
                .padding(horizontal = EffySpacing.lg, vertical = EffySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(EffySpacing.xs),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
                ) {
                    address.label?.takeIf { it.isNotBlank() }?.let {
                        Text(it, style = MaterialTheme.typography.titleSmall)
                    }
                    if (address.isDefault) DefaultBadge()
                }
                Text(address.recipientName, style = MaterialTheme.typography.bodyMedium)
                Text(
                    address.formatLines(),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                address.phone?.takeIf { it.isNotBlank() }?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Spacer(Modifier.width(EffySpacing.md))
            Icon(
                painter = painterResource(Res.drawable.ic_arrow_back),
                contentDescription = null,
                modifier = Modifier.size(18.dp).rotate(180f),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        // The per-row controls — deliberately NOT part of the edit target (022 FR-017a).
        //
        // ⚠ 034 pass: "Delete" is no longer shouted on every row. It was one of two identically
        // weighted text buttons, so the most destructive action on the screen had the same voice as a
        // routine one, repeated down the whole list. It is now the quiet one, and the row's own
        // spacing comes from the shared scale rather than five hand-picked dp values.
        Row(
            Modifier
                .fillMaxWidth()
                .padding(start = EffySpacing.md, end = EffySpacing.lg, bottom = EffySpacing.xs),
            horizontalArrangement = Arrangement.spacedBy(EffySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (!address.isDefault) {
                TextButton(onClick = onSetDefault) {
                    Text("Set as default", style = MaterialTheme.typography.labelLarge)
                }
            }
            Spacer(Modifier.weight(1f))
            TextButton(onClick = onDelete) {
                Text(
                    "Delete",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun DefaultBadge() {
    // ⚠ The WORD "Default", not a coloured dot (034 FR-036 / FR-057). Under a monochrome palette a
    // colour-only marker is a lightness difference and nothing more — invisible to a shopper who
    // cannot distinguish it, and nearly invisible to everyone else. The word carries the meaning; the
    // fill is only emphasis.
    Surface(color = MaterialTheme.colorScheme.primary, shape = MaterialTheme.shapes.small) {
        Text(
            "Default",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onPrimary,
            modifier = Modifier.padding(horizontal = EffySpacing.s, vertical = 2.dp),
        )
    }
}

private fun SavedAddress.formatLines(): String = buildString {
    append(line1)
    line2?.takeIf { it.isNotBlank() }?.let { append(", ").append(it) }
    append(", ").append(city)
    region?.takeIf { it.isNotBlank() }?.let { append(" ").append(it) }
    append(" ").append(postalCode)
}
