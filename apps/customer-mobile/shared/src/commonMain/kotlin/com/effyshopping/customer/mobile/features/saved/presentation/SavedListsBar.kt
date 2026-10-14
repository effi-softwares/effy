package com.effyshopping.customer.mobile.features.saved.presentation

import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.LazyRow
import com.effyshopping.customer.mobile.core.presentation.EffyTextLink
import com.effyshopping.customer.mobile.core.presentation.EffyChip
import com.effyshopping.customer.mobile.resources.lucide_trash_2
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.core.presentation.EffyField
import com.effyshopping.customer.mobile.core.presentation.EffySheet
import com.effyshopping.customer.mobile.core.presentation.EffyConfirmSheet
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import com.effyshopping.customer.mobile.features.saved.domain.SavedList
import com.effyshopping.customer.mobile.features.saved.domain.listNameRemaining
import com.effyshopping.mobile.design.EffySpacing

/**
 * The shopper's lists, in one place (068 FR-027): "Saved" first, each with its count.
 *
 * A row of chips over one list of rows (087, Saved board). The row SCROLLS rather than squeezing, so
 * twenty lists stay one line and each chip keeps a full 48dp target.
 *
 * Rename and delete sit under the row and only for a list the shopper made: "Saved" cannot be
 * renamed or deleted, so neither is offered for it (FR-003).
 */
@Composable
fun SavedListsBar(
    lists: List<SavedList>,
    selectedId: String,
    onSelect: (String) -> Unit,
    onRename: () -> Unit,
    onDelete: () -> Unit,
) {
    val index = lists.indexOfFirst { it.id == selectedId }.coerceAtLeast(0)
    // 087 (Saved board) — a scrolling row of list chips, the selected one in the light-blue tint.
    LazyRow(
        modifier = Modifier.fillMaxWidth().selectableGroup(),
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
        contentPadding = PaddingValues(horizontal = EffySpacing.lg),
    ) {
        items(lists, key = { it.id }) { list ->
            // Plain text. A list name is the shopper's own and is never interpreted.
            EffyChip("${list.label} (${list.count})", selected = list.id == selectedId, onClick = { onSelect(list.id) })
        }
    }
    if (lists.getOrNull(index)?.isDefault == false) {
        Row(modifier = Modifier.fillMaxWidth().padding(horizontal = EffySpacing.xs)) {
            EffyTextLink("Rename list", onClick = onRename)
            EffyTextLink("Delete list", onClick = onDelete)
        }
    }
}

/**
 * Name a new list, or rename one.
 *
 * [onSubmit] reports back the sentence to show when the platform refused (a taken name, a full set of
 * lists), or null when it went through — and only then does the dialog close, so what the shopper
 * typed is still there to correct.
 */
@Composable
fun ListNameDialog(
    title: String,
    confirmLabel: String,
    initial: String,
    onSubmit: (name: String, onResult: (String?) -> Unit) -> Unit,
    onDismiss: () -> Unit,
) {
    var name by remember { mutableStateOf(initial) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val remaining = listNameRemaining(name)

    // 087 — a sheet, not a dialog: the field above, the action pinned below it and above the keyboard.
    EffySheet(
        title = title,
        onDismiss = onDismiss,
        dirty = name != initial && name.isNotBlank(),
        busy = busy,
        primaryLabel = confirmLabel,
        primaryEnabled = !busy && name.isNotBlank() && remaining >= 0,
        primaryLoading = busy,
        onPrimary = {
            busy = true
            onSubmit(name) { refusal ->
                busy = false
                if (refusal == null) onDismiss() else error = refusal
            }
        },
    ) {
        EffyField(
            label = "Name",
            value = name,
            onValueChange = {
                name = it
                error = null
            },
            placeholder = "Weekly shop",
            error = error ?: if (remaining < 0) "${-remaining} too many characters" else null,
        )
        if (error == null && remaining >= 0) {
            Text("$remaining characters left", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/**
 * ⚠ BOTH NUMBERS, BEFORE ANYTHING IS DELETED (FR-006): what is in the list, and how much of it lives
 * nowhere else. The second is what the shopper actually loses — the delete un-saves exactly that many.
 */
@Composable
fun DeleteListDialog(list: SavedList, onConfirm: (onResult: (String?) -> Unit) -> Unit, onDismiss: () -> Unit) {
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    EffyConfirmSheet(
        title = "Delete \"${list.label}\"?",
        body = deleteSummary(list.count, list.onlyHereCount),
        confirmLabel = "Delete list",
        icon = Res.drawable.lucide_trash_2,
        destructive = true,
        busy = busy,
        error = error,
        onConfirm = {
            busy = true
            onConfirm { refusal ->
                busy = false
                if (refusal == null) onDismiss() else error = refusal
            }
        },
        onDismiss = onDismiss,
    )
}

/** What deleting a list costs, in the shopper's terms. Word for word what customer-web says. */
fun deleteSummary(count: Int, onlyHereCount: Int): String {
    if (count == 0) return "This list is empty."
    val items = if (count == 1) "1 item" else "$count items"
    if (onlyHereCount == 0) return "This list has $items. All of them are in another list too, so they stay saved."
    val lost = if (onlyHereCount == 1) "1 of them isn't in any other list and will no longer be saved."
    else "$onlyHereCount of them aren't in any other list and will no longer be saved."
    return "This list has $items. $lost"
}
