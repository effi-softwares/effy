package com.effyshopping.customer.mobile.features.addresses.presentation

import com.effyshopping.customer.mobile.core.theme.EffyRoles
import com.effyshopping.customer.mobile.core.presentation.EffyGhostButton
import com.effyshopping.customer.mobile.core.presentation.EffyTextLink
import com.effyshopping.customer.mobile.core.presentation.EffyChevron
import com.effyshopping.customer.mobile.core.presentation.EffyInlineError
import com.effyshopping.customer.mobile.resources.lucide_trash_2
import com.effyshopping.customer.mobile.core.presentation.EffyConfirmSheet
import com.effyshopping.customer.mobile.core.delivery.Coverage
import com.effyshopping.customer.mobile.core.delivery.CoverageWords
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
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import com.effyshopping.customer.mobile.core.presentation.EffyAppBar
import com.effyshopping.customer.mobile.core.presentation.EffyEmptyState
import com.effyshopping.customer.mobile.core.presentation.EffyLoading
import com.effyshopping.customer.mobile.core.presentation.EffySkeletonText
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
 * The address book. A LazyColumn of addresses (never cards — Principle V), the default clearly
 * marked, an empty state, and a FAB that raises the add form in a ModalBottomSheet. The row body opens
 * edit (a large forgiving target); "Set default" and "Delete" are distinct per-row controls.
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

    // A bottom-anchored full-width button, not a FAB: a FAB covers the last row (where a new address lands)
    // and out-shouts Edit, and nudging shoppers to add rather than edit leaves stale addresses to pick
    // wrongly at checkout. The row body is the edit target.
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
            // The source's app bar — a real back affordance instead of a "Back" text button
            // floating opposite the title (025 FR-030 banned improvised text-link navigation, and
            // this screen was the last place one survived).
            EffyAppBar(title = "Address book", onBack = onBack)
            when {
                state.loading -> AddressBookSkeleton()

                state.addresses.isEmpty() -> EffyEmptyState(
                    title = "No saved addresses",
                    body = "Add a delivery address and it’ll be ready at checkout.",
                    actionLabel = "Add address",
                    onAction = { vm.openAdd() },
                )

                else ->
                    LazyColumn(Modifier.fillMaxSize()) {
                        // 087 (Address book board) — what this list is for, once, above it.
                        item(key = "intro") {
                            Text(
                                "Where we deliver. Each address shows who can deliver there.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(horizontal = EffySpacing.lg, vertical = EffySpacing.md),
                            )
                        }
                        state.error?.let { err ->
                            item {
                                EffyInlineError(err, modifier = Modifier.padding(EffySpacing.lg))
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
        // On the shared EffySheet now, rather than a hand-rolled ModalBottomSheet with
        // its own state and padding. `dirty = false` deliberately: this form's draft already lives in
        // the ViewModel and survives dismissal, so the discard prompt would be asking about work that
        // is not actually lost. The single-field editors, whose value dies with the sheet, pass true.
        EffySheet(
            title = if (sheet.editingId != null) "Edit address" else "Add an address",
            onDismiss = { vm.dismissSheet() },
            primaryLabel = if (sheet.editingId != null) "Save" else "Save address",
            onPrimary = { vm.submit() },
            primaryEnabled = !sheet.saving,
            primaryLoading = sheet.saving,
            // 087 (AddressForm board): full height, Save pinned above the keyboard.
            fullHeight = true,
        ) {
            AddressFormSheet(
                form = sheet.form,
                fieldErrors = sheet.fieldErrors,
                onChange = vm::onFormChange,
            )
        }
    }

    // Confirm delete — a sheet with its actions pinned (087: no dialogs).
    state.pendingDeleteId?.let {
        EffyConfirmSheet(
            title = "Delete this address?",
            body = "This won’t affect any past orders.",
            confirmLabel = "Delete address",
            icon = Res.drawable.lucide_trash_2,
            destructive = true,
            onConfirm = { vm.confirmDelete() },
            onDismiss = { vm.cancelDelete() },
        )
    }

    // Delete-default blocked (server 409): prompt to reassign first.
    if (state.reassignPrompt) {
        EffySheet(
            title = "Set another default first",
            onDismiss = { vm.dismissReassignPrompt() },
            primaryLabel = "Got it",
            onPrimary = { vm.dismissReassignPrompt() },
            cancelLabel = null,
        ) {
            Text(
                "This is your default delivery address. Make another address the default, then delete this one.",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/** The book before it reads: its fixed line, then rows laid out as [AddressRow] lays them out, ruled the same. */
@Composable
private fun AddressBookSkeleton() {
    val type = MaterialTheme.typography
    EffyLoading(Modifier.fillMaxSize(), label = "Loading your addresses") {
        Column(Modifier.fillMaxSize()) {
            Text(
                "Where we deliver. Each address shows who can deliver there.",
                style = type.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = EffySpacing.lg, vertical = EffySpacing.md),
            )
            repeat(3) { i ->
                Column(
                    Modifier.fillMaxWidth().padding(horizontal = EffySpacing.lg, vertical = EffySpacing.md),
                    verticalArrangement = Arrangement.spacedBy(EffySpacing.xs),
                ) {
                    EffySkeletonText(type.titleSmall, Modifier.fillMaxWidth(), widthFraction = 0.3f)
                    EffySkeletonText(type.bodyMedium, Modifier.fillMaxWidth(), widthFraction = if (i % 2 == 0) 0.5f else 0.4f)
                    EffySkeletonText(type.bodySmall, Modifier.fillMaxWidth(), widthFraction = 0.75f)
                    EffySkeletonText(type.bodySmall, Modifier.fillMaxWidth(), widthFraction = 0.35f)
                }
                EffyHairline()
            }
        }
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
        // The row body is the edit affordance — a big touch target.
        //
        // Pass: it now carries a chevron. The body has always been tappable and nothing said
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
                // Who delivers here, or the one refusal sentence: the same words checkout
                // uses, so the shopper learns it here rather than after building an order.
                // 087 (Addresses board): "Delivered by Effy" in Effy green, the refusal with an icon.
                CoverageWords.describe(address.coverage)?.let {
                    when (address.coverage) {
                        Coverage.None -> EffyInlineError(it)
                        Coverage.Effy -> Text(it, style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold), color = EffyRoles.brand)
                        else -> Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            Spacer(Modifier.width(EffySpacing.md))
            EffyChevron()
        }

        // The per-row controls, not part of the edit target; Delete is the quiet one.
        Row(
            Modifier
                .fillMaxWidth()
                .padding(start = EffySpacing.md, end = EffySpacing.lg, bottom = EffySpacing.xs),
            horizontalArrangement = Arrangement.spacedBy(EffySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (!address.isDefault) EffyTextLink("Set as default", onClick = onSetDefault)
            Spacer(Modifier.weight(1f))
            EffyGhostButton("Delete", onClick = onDelete, color = MaterialTheme.colorScheme.onSurfaceVariant, leading = Res.drawable.lucide_trash_2)
        }
    }
}

@Composable
private fun DefaultBadge() {
    // The word "Default", not a coloured dot. Under a monochrome palette a
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
