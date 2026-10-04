package com.effyshopping.customer.mobile.features.saved.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.presentation.EffyMinTouchTarget
import com.effyshopping.customer.mobile.core.presentation.EffyPrimaryButton
import com.effyshopping.customer.mobile.core.presentation.EffySecondaryButton
import com.effyshopping.customer.mobile.core.presentation.EffySheet
import com.effyshopping.customer.mobile.core.session.SessionState
import com.effyshopping.customer.mobile.features.saved.domain.SavedList
import com.effyshopping.customer.mobile.features.saved.domain.listNameRemaining
import com.effyshopping.mobile.design.EffySpacing

/**
 * The list chooser (068): a sheet of tick boxes, one per list, and a field to make a new one.
 *
 * Reached from four places and no others (FR-014): the product page, a row on a list's page, the
 * snackbar after a one-tap save, and a filled heart on a product that is in a named list.
 *
 * ⚠ ROWS, NOT CARDS (Principle V), each a full-width [EffyMinTouchTarget]-tall toggle so the whole row
 * is the target and a screen reader announces one checkbox with the list's name.
 *
 * [onRequireSignIn] is null where the screen has no route to sign-in; the guest message then says
 * where to go instead of offering a button that does nothing.
 */
@Composable
fun ListChooserSheet(
    container: AppContainer,
    productId: String,
    onDismiss: () -> Unit,
    onRequireSignIn: (() -> Unit)? = null,
) {
    val vm = remember(productId) {
        ListChooserViewModel(
            productId = productId,
            isSignedIn = { container.session.state.value is SessionState.Authenticated },
            loadLists = container.loadLists,
            addToList = container.addToList,
            removeFromList = container.removeFromList,
            createList = container.createList,
        )
    }
    val state by vm.state.collectAsState()
    var name by remember { mutableStateOf("") }

    EffySheet(title = "Add to a list", onDismiss = onDismiss, cancelLabel = "Done") {
        when (val s = state) {
            ListChooserState.Loading -> Text(
                "Loading your lists…",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            ListChooserState.Failed -> Text(
                "We couldn't load your lists. Close this and try again.",
                style = MaterialTheme.typography.bodyMedium,
            )

            ListChooserState.SignedOut -> Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.md)) {
                Text(
                    "Lists like \"Weekly Items\" need an account. This item is saved on this device and " +
                        "will join your saved items when you sign in." +
                        if (onRequireSignIn == null) " You can sign in from the Account tab." else "",
                    style = MaterialTheme.typography.bodyMedium,
                )
                if (onRequireSignIn != null) {
                    EffyPrimaryButton(label = "Sign in", onClick = {
                        onDismiss()
                        onRequireSignIn()
                    })
                }
            }

            is ListChooserState.Ready -> {
                val idle = s.pending == null
                s.lists.forEach { list ->
                    ListRow(list = list, enabled = idle, onToggle = { vm.toggle(list) })
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                }
                s.error?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = EffySpacing.s),
                    )
                }

                val remaining = listNameRemaining(name)
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("New list") },
                    placeholder = { Text("Weekly Items") },
                    singleLine = true,
                    isError = s.nameError != null || remaining < 0,
                    supportingText = {
                        Text(
                            s.nameError
                                ?: if (remaining < 0) "${-remaining} too many characters"
                                else "$remaining characters left",
                        )
                    },
                    modifier = Modifier.fillMaxWidth().padding(top = EffySpacing.md),
                )
                EffySecondaryButton(
                    label = "Create list",
                    onClick = { vm.create(name) { name = "" } },
                    enabled = idle && name.isNotBlank() && remaining >= 0,
                    loading = s.pending == ListChooserState.NEW_LIST,
                )
            }
        }
    }
}

@Composable
private fun ListRow(list: SavedList, enabled: Boolean, onToggle: () -> Unit) {
    val checked = list.containsProduct == true
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = EffyMinTouchTarget)
            .toggleable(value = checked, enabled = enabled, role = Role.Checkbox, onValueChange = { onToggle() }),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
    ) {
        // ⚠ `onCheckedChange = null`: the ROW is the control. A second click target inside it would
        // make a screen reader announce two checkboxes for one list.
        Checkbox(checked = checked, onCheckedChange = null, enabled = enabled)
        // Plain text. A list name is the shopper's own and is never interpreted.
        Text(
            list.label,
            style = MaterialTheme.typography.bodyLarge,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Text(
            list.count.toString(),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
